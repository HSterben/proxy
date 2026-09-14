import { useState, useEffect, useRef, useCallback } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "../../../backend/convex/_generated/api";
import TitleBar from "../components/TitleBar";
import { convexUrl } from "../lib/convexUrls";
import "./SettingsView.css";
import "./ManageSubscriptionView.css";

const api_ = typeof window !== "undefined" ? window.electronAPI : null;

const CONVEX_URL = convexUrl;

function formatDate(ms) {
  if (!ms) return "n/a";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatQuota(used, limit) {
  if (!limit) return "n/a";
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return `${pct}% used this period`;
}

export default function ManageSubscriptionView() {
  const convex = useRef(new ConvexClient(CONVEX_URL));
  const [authToken, setAuthToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadAccount = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const data = await convex.current.query(api.account.getMyAccount, {});
      setAccount(data);
    } catch (err) {
      console.error("Failed to load account:", err);
      showMessage("Couldn’t load account details.", true);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    const init = async () => {
      if (!api_) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      try {
        const token = await api_.getAuthToken();
        if (token) {
          setAuthToken(token);
          convex.current.setAuth(async () => token);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setIsAuthenticated(false);
        setLoading(false);
      }
    };
    init();

    const unsubSuccess = api_?.onAuthSuccess?.((data) => {
      if (data.token) {
        setAuthToken(data.token);
        convex.current.setAuth(async () => data.token);
        setIsAuthenticated(true);
      } else {
        setAuthToken(null);
        convex.current.clearAuth();
        setIsAuthenticated(false);
        setAccount(null);
        setLoading(false);
      }
    });
    const unsubLogout = api_?.onAuthLogout?.(() => {
      setAuthToken(null);
      try {
        convex.current.clearAuth();
      } catch (_) {
        convex.current.setAuth(async () => null);
      }
      setIsAuthenticated(false);
      setAccount(null);
    });
    return () => {
      unsubSuccess?.();
      unsubLogout?.();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadAccount();
  }, [isAuthenticated, loadAccount]);

  const openWebsiteBilling = async () => {
    const base = (account?.websiteUrl || "https://getproxy.ca").replace(/\/$/, "");
    await api_?.openExternal?.(`${base}/account/billing`);
  };

  const status = account?.status || "none";
  const badgeClass = status === "none" ? "canceled" : status.replace(/ /g, "_");
  const usagePct =
    account?.weightedTokenLimit > 0
      ? Math.min(
          100,
          Math.round((account.weightedTokensUsed / account.weightedTokenLimit) * 100)
        )
      : 0;
  const usageTone =
    usagePct >= 90 ? "danger" : usagePct >= 70 ? "warn" : "ok";

  if (!api_) {
    return (
      <div className="settings-view">
        <p style={{ padding: 24 }}>Open Account from the PROXY desktop app.</p>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <TitleBar title="Account" onClose={() => api_?.closeWindow?.()} />

      <div className="settings-scroll">
        {message && (
          <div className={`settings-message ${message.isError ? "error" : ""}`}>{message.text}</div>
        )}

        {isAuthenticated === null || (isAuthenticated && loading) ? (
          <div className="subscription-loading">
            <div className="subscription-spinner" />
            <span>Loading account…</span>
          </div>
        ) : !isAuthenticated ? (
          <div className="subscription-auth-prompt">
            <h2>Sign in to view plan and usage</h2>
            <p>Your PROXY plan, renewal date, and token usage show here after you sign in.</p>
            <button type="button" className="btn-primary" onClick={() => api_?.openLogin?.()}>
              Sign in
            </button>
          </div>
        ) : (
          <>
            <section className="settings-section">
              <h2>Plan and usage</h2>
              <p className="settings-hint">
                Change plan, payment method, or cancel on the PROXY website. This window only shows status and usage.
              </p>

              <div className="subscription-status-card">
                <div className="subscription-status-row">
                  <span className="subscription-status-label">Status</span>
                  <span className={`subscription-badge ${badgeClass}`}>
                    {account?.subscriptionActive
                      ? status.replace(/_/g, " ")
                      : status === "none"
                        ? "Free"
                        : status.replace(/_/g, " ")}
                  </span>
                </div>
                {account?.email && (
                  <div className="subscription-status-row">
                    <span className="subscription-status-label">Account</span>
                    <span className="subscription-status-value">{account.email}</span>
                  </div>
                )}
                {account?.plan && (
                  <div className="subscription-status-row">
                    <span className="subscription-status-label">Plan</span>
                    <span className="subscription-status-value">
                      {account.plan === "free" ? "Free" : account.plan}
                    </span>
                  </div>
                )}
                {account?.currentPeriodEnd && account.subscriptionActive && (
                  <div className="subscription-status-row">
                    <span className="subscription-status-label">Renews on</span>
                    <span className="subscription-status-value">
                      {formatDate(account.currentPeriodEnd)}
                    </span>
                  </div>
                )}
                {account && (
                  <div className="subscription-usage-block">
                    <div className="subscription-status-row">
                      <span className="subscription-status-label">
                        {account.subscriptionActive ? "Usage this period" : "Free lifetime usage"}
                      </span>
                      <span className="subscription-status-value">
                        {formatQuota(account.weightedTokensUsed, account.weightedTokenLimit)}
                      </span>
                    </div>
                    <div
                      className="subscription-usage-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={usagePct}
                      aria-label={
                        account.subscriptionActive ? "Usage this period" : "Free lifetime usage"
                      }
                    >
                      <div
                        className={`subscription-usage-fill subscription-usage-fill-${usageTone}`}
                        style={{ width: `${usagePct}%` }}
                      />
                    </div>
                    {!account.subscriptionActive && (
                      <p className="settings-hint" style={{ marginTop: 8 }}>
                        Free includes 30,000 weighted tokens (no monthly reset) and Simplify, List,
                        and Critique. Subscribe for more tokens and custom states.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="subscription-actions">
                <button type="button" className="btn-primary" onClick={openWebsiteBilling}>
                  Open billing on the website
                </button>
                <button type="button" className="btn-secondary" onClick={loadAccount} disabled={loading}>
                  Refresh status
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={async () => {
                    await api_?.logout?.();
                    setIsAuthenticated(false);
                    setAccount(null);
                  }}
                >
                  Sign out
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

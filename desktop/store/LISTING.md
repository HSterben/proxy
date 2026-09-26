# Microsoft Store listing notes (Partner Center)

Paste/adapt the free-plan limitations into the Store description. Microsoft treats free usage as trial features and requires the limits to be explicit.

## Free plan limitations (current product)

Use wording like this near the bottom of the description:

> Free plan: About 30 chat requests (lifetime) and up to 3 active official States (Simplify, List, Critique). Custom States and higher chat capacity require a paid PROXY subscription (Pro from $10/month or Yearly $99/year). Billing is managed at getproxy.ca - the Windows app does not process payments itself.

Do not describe free usage in weighted tokens in the Store listing; use approximate requests as above.

## Auth / certification note

Store/MSIX builds declare the `proxy://` protocol in `assets/msix/AppxManifest.xml` and also use a localhost loopback fallback during sign-in. Rebuild the MSIX after pulling these changes before resubmitting.

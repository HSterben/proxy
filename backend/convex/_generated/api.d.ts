/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as ai_model from "../ai/model.js";
import type * as ai_provider from "../ai/provider.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as defaultStates from "../defaultStates.js";
import type * as entitlements from "../entitlements.js";
import type * as gallery from "../gallery.js";
import type * as http from "../http.js";
import type * as openrouter from "../openrouter.js";
import type * as openrouterModel from "../openrouterModel.js";
import type * as plans from "../plans.js";
import type * as signupRateLimit from "../signupRateLimit.js";
import type * as states from "../states.js";
import type * as subscriptions from "../subscriptions.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  "ai/model": typeof ai_model;
  "ai/provider": typeof ai_provider;
  auth: typeof auth;
  billing: typeof billing;
  defaultStates: typeof defaultStates;
  entitlements: typeof entitlements;
  gallery: typeof gallery;
  http: typeof http;
  openrouter: typeof openrouter;
  openrouterModel: typeof openrouterModel;
  plans: typeof plans;
  signupRateLimit: typeof signupRateLimit;
  states: typeof states;
  subscriptions: typeof subscriptions;
  usage: typeof usage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

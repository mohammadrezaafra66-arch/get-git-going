import base from "./playwright.config";
export default {
  ...base,
  testMatch: [/auth\/generate-role-sessions\.spec\.ts/],
  projects: undefined,
  reporter: [["list"]],
};
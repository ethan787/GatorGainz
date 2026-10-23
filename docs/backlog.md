# Starter Jira backlog

Suggested small stories to copy into your team's Jira project. This file does not create external issues.

| Story                  | Acceptance criteria                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Verify email ownership | Add email verification before enabling features that require a trusted address.                                      |
| Reset a password       | Provide expiring, single-use reset tokens and revoke existing sessions after a password reset.                       |
| Log a workout          | Persist the client's workout sessions through authenticated API routes; account-scoped progress and rankings update. |
| Manage workout history | Users can edit or delete only their own records.                                                                     |
| Create a workout goal  | Users can set a title, positive workout target, start date, and target date.                                         |
| Manage goals           | Users can edit or delete their own goals; progress stays derived from workout records.                               |
| Improve rankings       | Decide leaderboard periods and profile visibility with the team before extending the all-time view.                  |
| Add client tests       | Maintain automated browser coverage for account flows, session drafts/submission, exercise filters, and themes.      |
| Prepare deployment     | Configure HTTPS, secure cookie origin, shared rate limits, database backups, client hosting, and API routing.        |

Registration, login, session restore, and logout now use PostgreSQL; see [the authentication implementation](authentication.md). Start the remaining work with authenticated workout ownership rules and implement one workout flow end to end. Keep progress charts and rankings simple until the core flows work.

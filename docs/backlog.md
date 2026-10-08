# Starter Jira backlog

Suggested small stories to copy into your team's Jira project. This file does not create external issues.

| Story                  | Acceptance criteria                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Register and sign in   | Validate input, normalize email, hash passwords with bcrypt, establish a session, and protect private routes. |
| Log a workout          | Signed-in users can add a workout with category, date, and positive duration; progress and rankings update.   |
| Manage workout history | Users can edit or delete only their own records.                                                              |
| Create a workout goal  | Users can set a title, positive workout target, start date, and target date.                                  |
| Manage goals           | Users can edit or delete their own goals; progress stays derived from workout records.                        |
| Improve rankings       | Decide leaderboard periods and profile visibility with the team before extending the all-time view.           |
| Add client tests       | Cover loading, error, empty, and successful dashboard states before adding interactive editing.               |
| Prepare deployment     | Add versioned database migrations, environment configuration, client hosting, and API routing.                |

Start with authentication and ownership rules, then implement one workout flow end to end. Keep progress charts and rankings simple until the core flows work.

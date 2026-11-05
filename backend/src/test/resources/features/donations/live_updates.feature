@donations
Feature: A signed-in browser hears about new data while a page is open

  The browser keeps one stream open at /api/live while a page that shows changing data is
  visible. The stream carries only the names of the feeds that changed, never data; the page
  then reads what changed through the usual endpoints. A stream needs a browser session: a
  visitor without a token and a connected application are refused before any stream opens.
  Opening a stream, its hints, its caps and its closing are proved by LiveEndpointTest and
  LiveStreamHubTest, because a scenario reads whole answers and a stream never ends by itself.

  Scenario: A visitor without a token gets no stream
    When someone without a token opens the live stream
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

@donations
Feature: A signed-in browser hears about new data while a page is open

  The browser keeps one stream open at /api/live while a page that shows changing data is
  visible. The stream carries only the names of the feeds that changed, never data; the page
  then reads what changed through the usual endpoints. A stream needs a browser session: a
  visitor without a token and a connected application are refused before any stream opens.
  The server keeps at most 50 streams, ten of them for administrators, and keeps answering
  while all of them are open, because a stream holds no request thread. The hints and the
  closing of a stream are proved by LiveEndpointTest and LiveStreamHubTest.

  Scenario: A visitor without a token gets no stream
    When someone without a token opens the live stream
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: Ten of the fifty streams stay for administrators, and the server answers while all are open
    Given 8 donors each keep 5 live streams open
    When another donor opens a live stream
    Then that live stream is refused with 429 and the problem type ending with "live-streams-full"
    When 2 administrators each keep 5 live streams open
    And another administrator opens a live stream
    Then that live stream is refused with 429 and the problem type ending with "live-streams-full"
    And the health endpoint answers while 50 live streams are open

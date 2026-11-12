@donations
Feature: Anyone reads the bank logos the server keeps, to show them beside Czech account numbers

  Background:
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" serves the picture "spořitelna"
    And the logo address "https://is3-ssl.mzstatic.com/image/thumb/fio/512x512bb.jpg" serves the picture "fio"

  Scenario: The list names each bank with a fetched logo and answers alike with and without a token
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And "Jana" has set the logo of bank "2010" from "https://is3-ssl.mzstatic.com/image/thumb/fio/512x512bb.jpg"
    When someone without a token asks for the published bank logos
    Then the response status is 200
    And the published bank logos are the ones of banks "0800, 2010"
    And the bank logo list may be kept privately for five minutes
    When "Jana" asks for the published bank logos
    Then the response status is 200
    And the published bank logos are the ones of banks "0800, 2010"
    And the bank logo list may be kept privately for five minutes

  Scenario: Before any logo is set the list is empty
    When someone without a token asks for the published bank logos
    Then the response status is 200
    And the published bank logos are the ones of banks ""

  Scenario: A logo image is served as a WebP that never changes under its id
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    When someone without a token asks for the image of the logo of bank "0800"
    Then the response status is 200
    And the answer is the picture "spořitelna" as a WebP that may be kept for a year

  Scenario: An image that never existed or was replaced is not found
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the image of the logo of bank "0800" is remembered
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" serves the picture "nová spořitelna"
    And "Jana" refreshes the logo of bank "0800"
    When someone without a token asks for the remembered logo image
    Then the response status is 404
    And the problem type ends with "donations/bank-logo-image-not-found"
    When someone without a token asks for a logo image that never existed
    Then the response status is 404

  Scenario: One address reads the logos at most 120 times in 15 minutes
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    When someone without a token asks for the published bank logos 120 times
    And someone without a token asks for the image of the logo of bank "0800"
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When the following requests come from another client address
    And someone without a token asks for the published bank logos
    Then the response status is 200

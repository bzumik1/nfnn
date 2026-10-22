Feature: Donor changes the password or the e-mail while signed in

  Scenario: Changing the password with the current one keeps this session, ends the others and only the new password signs in
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor changes the password from "correct horse battery" to "a brand new passphrase"
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    When the donor refreshes the session
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "a brand new passphrase"
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401

  Scenario: A wrong current password changes nothing
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor changes the password from "wrong horse battery" to "a brand new passphrase"
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    And the problem has the title "Nesprávné současné heslo"
    When the donor refreshes the session
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: A common or short new password is refused
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor changes the password from "correct horse battery" to "password1234"
    Then the response status is 400
    And the problem type ends with "donors/password-too-common"
    When the donor changes the password from "correct horse battery" to "short"
    Then the response status is 400
    And the problem lists an error for field "newPassword"

  Scenario: Without a session neither the password nor the e-mail can be changed
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And nobody is signed in
    When the donor changes the password from "correct horse battery" to "a brand new passphrase"
    Then the response status is 401
    When the donor asks to change the e-mail to "jana.nova@example.cz" with password "correct horse battery"
    Then the response status is 401

  Scenario: The eleventh password change within 15 minutes from one address is refused, even with the right password
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor changed the password from "wrong horse battery" to "a brand new passphrase" 10 times
    When the donor changes the password from "correct horse battery" to "a brand new passphrase"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"
    When the following requests come from another client address
    And the donor changes the password from "correct horse battery" to "a brand new passphrase"
    Then the response status is 200

  Scenario: Changing the e-mail sends a link to the new address, confirming it switches the account, tells the old address and ends other sessions
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor asks to change the e-mail to "Jana.Nova@Example.cz" with password "correct horse battery"
    Then the response status is 202
    And 1 e-mail is sent to "jana.nova@example.cz" with the subject "Potvrďte novou e-mailovou adresu – Nová naděje"
    And both parts of the last e-mail contain "jana.nova@example.cz"
    And neither part of the last e-mail contains "jana@example.cz"
    And 1 verification link is stored
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana.nova@example.cz"
    And 0 verification links are stored
    And e-mail 2 goes to "jana@example.cz" with the subject "E-mail vašeho dárcovského účtu byl změněn – Nová naděje"
    And both parts of the last e-mail contain "jana.nova@example.cz"
    And neither part of the last e-mail contains "token="
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    When the donor refreshes the session
    Then the response status is 200
    When the donor signs in with email "jana.nova@example.cz" and password "correct horse battery"
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401

  Scenario: A change link can be used once and the old address still signs in until then
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor asks to change the e-mail to "jana.nova@example.cz" with password "correct horse battery"
    Then the response status is 202
    And 1 e-mail is sent to "jana.nova@example.cz" with the subject "Potvrďte novou e-mailovou adresu – Nová naděje"
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    When the donor confirms the e-mail with the link from e-mail 1
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"

  Scenario: An address another account has gets a notice, nothing changes and the answer does not say so
    Given a person registered with email "petr@example.cz" and password "correct horse battery"
    And a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor asks to change the e-mail to "Petr@Example.cz" with password "correct horse battery"
    Then the response status is 202
    And 1 e-mail is sent to "petr@example.cz" with the subject "Vaši adresu chtěl použít jiný účet – Nová naděje"
    And neither part of the last e-mail contains "jana@example.cz"
    And 0 verification links are stored
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: The current address, a wrong password and a malformed address are refused without sending anything
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor asks to change the e-mail to "JANA@example.cz" with password "correct horse battery"
    Then the response status is 400
    And the problem type ends with "donors/email-unchanged"
    And the problem has the title "Tuto adresu už váš účet má"
    When the donor asks to change the e-mail to "jana.nova@example.cz" with password "wrong horse battery"
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    When the donor asks to change the e-mail to "not-an-email" with password "correct horse battery"
    Then the response status is 400
    And the problem lists an error for field "newEmail"
    And no email is sent
    And 0 verification links are stored

  Scenario: A change link whose address was registered meanwhile no longer works
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor asks to change the e-mail to "jana.nova@example.cz" with password "correct horse battery"
    Then the response status is 202
    And the donor keeps the link from the e-mail
    Given a person registered with email "jana.nova@example.cz" and password "another fine passphrase"
    When the donor confirms the e-mail with the kept link
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: The sixth e-mail change request within an hour from one address is refused
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor asked to change the e-mail with password "correct horse battery" 5 times
    When the donor asks to change the e-mail to "jana.nova@example.cz" with password "correct horse battery"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"
    And 3 verification links are stored

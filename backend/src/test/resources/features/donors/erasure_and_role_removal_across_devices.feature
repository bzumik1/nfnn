@donors
Feature: An erasure and a removed administrator role reach every device of the account, one that stayed offline for a month too

  A device asks how its sign-in stands when it starts, signs out or loses its session, so an order
  written while it is away waits for it on the server. The orders are kept as long as the device
  row is: an erasure orders every device of the account to delete everything it keeps for the
  account, signed in or not; removing the administrator role orders every device to delete the
  administration's copy only, so the donor's own copy stays (plan v3 2.21, 2.17 hand-off). No
  order is ever lowered or lifted, by a new sign-in, a role granted again or the time that
  passes. A device the server has forgotten, 400 days after it ended, is unknown and deletes
  everything (plan v3 D31).

  Background:
    Given today is 2026-11-06
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Petr" is an administrator

  Scenario: An erasure reaches every device of the donor, the one offline for a month and the app that is still signed in
    Given "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "Android" and is remembered
    And "Jana" signs in on the "iPad" in the installed app
    And "Jana" signs in on the "Mac"
    And "Jana" signs out of the "Mac"
    When 31 days pass with the nightly clean-up
    Then the devices answer:
      | device  | status     | administrator |
      | iPhone  | signed-out | false         |
      | Android | signed-out | false         |
      | iPad    | signed-in  | false         |
      | Mac     | signed-out | false         |
    When "Petr" erased the donor "Jana"
    Then the devices answer:
      | device  | status   | administrator |
      | iPhone  | wipe-all | false         |
      | Android | wipe-all | false         |
      | iPad    | wipe-all | false         |
      | Mac     | wipe-all | false         |
    When 31 days pass with the nightly clean-up
    Then the devices answer:
      | device  | status   | administrator |
      | iPhone  | wipe-all | false         |
      | Android | wipe-all | false         |
      | iPad    | wipe-all | false         |
      | Mac     | wipe-all | false         |
    And the erased donor's devices keep only their ids, their secret's hash and the order to delete

  Scenario: Removing the role reaches every device of the administrator, the one offline for a month too, and orders only the administration's copy deleted
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "Android" and is remembered
    And "Jana" signs in on the "iPad" in the installed app
    When 31 days pass with the nightly clean-up
    Then the devices answer:
      | device  | status     | administrator |
      | iPhone  | signed-out | true          |
      | Android | signed-out | true          |
      | iPad    | signed-in  | true          |
    When "Petr" removes "Jana" from the administrators
    And 31 days pass with the nightly clean-up
    Then the devices answer:
      | device  | status     | administrator |
      | iPhone  | wipe-admin | false         |
      | Android | wipe-admin | false         |
      | iPad    | wipe-admin | false         |

  Scenario: A new sign-in and the role granted again lift no order the devices still have to carry out
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "iPad" in the installed app
    When "Petr" removes "Jana" from the administrators
    And "Jana" signs in on the "Mac"
    And "Petr" makes "Jana" an administrator
    And 31 days pass with the nightly clean-up
    And "Jana" signs in on the "Windows"
    Then the devices answer:
      | device  | status     | administrator |
      | iPhone  | wipe-admin | false         |
      | iPad    | wipe-admin | false         |
      | Mac     | signed-out | true          |
      | Windows | signed-in  | true          |

  Scenario: A device signed out remotely before the role removal keeps the order to delete everything
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "iPad" in the installed app
    And "Jana" signs out the "iPhone" on the "iPad"
    When 31 days pass with the nightly clean-up
    And "Petr" removes "Jana" from the administrators
    Then the devices answer:
      | device | status     | administrator |
      | iPhone | wipe-all   | false         |
      | iPad   | wipe-admin | false         |

  Scenario: Removing the role and then erasing the donor orders every device to delete everything
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "iPad" in the installed app
    And "Petr" removes "Jana" from the administrators
    When 31 days pass with the nightly clean-up
    And "Petr" erased the donor "Jana"
    Then the devices answer:
      | device | status   | administrator |
      | iPhone | wipe-all | false         |
      | iPad   | wipe-all | false         |

  Scenario: The orders of one account never reach another account's devices
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Petr" signs in on the "Mac"
    When "Petr" removes "Jana" from the administrators
    Then the devices answer:
      | device | status     | administrator |
      | iPhone | wipe-admin | false         |
      | Mac    | signed-in  | true          |

  Scenario: A device the server forgot, 400 days after it ended, is unknown and so deletes everything
    Given "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    And "Petr" removes "Jana" from the administrators
    When 399 days pass with the nightly clean-up
    Then the devices answer:
      | device | status     | administrator |
      | iPhone | wipe-admin | false         |
    When 2 days pass with the nightly clean-up
    Then the devices answer:
      | device | status  | administrator |
      | iPhone | unknown | false         |

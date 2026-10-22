package cz.novanadeje.app.cucumber;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;

public class AdminStepDefinitions {

    private final JdbcClient jdbc;
    private final ScenarioDonors scenarioDonors;
    private final DonorSessions sessions;
    private final SecondFactorEnrolments secondFactors;

    public AdminStepDefinitions(JdbcClient jdbc, ScenarioDonors scenarioDonors, DonorSessions sessions, SecondFactorEnrolments secondFactors) {
        this.jdbc = jdbc;
        this.scenarioDonors = scenarioDonors;
        this.sessions = sessions;
        this.secondFactors = secondFactors;
    }

    @Given("{string} is an administrator")
    public void isAnAdministrator(String alias) {
        grantAdminRole(alias);
        secondFactors.enable(alias);
        sessions.signInAgain(alias);
    }

    @When("{string} enables the second factor")
    public void enablesTheSecondFactor(String alias) {
        secondFactors.enable(alias);
    }

    @Given("{string} is given the administrator role without signing in again")
    public void isGivenTheAdministratorRoleWithoutSigningInAgain(String alias) {
        grantAdminRole(alias);
    }

    @When("{string} signs in again")
    public void signsInAgain(String alias) {
        sessions.signInAgain(alias);
    }

    private void grantAdminRole(String alias) {
        jdbc.sql("insert into donor_role (donor_id, role) values (?, 'ADMIN') on conflict do nothing").param(scenarioDonors.idOf(alias)).update();
    }
}

package cz.novanadeje.app.donors.application;

public record SecondFactorEnrolment(String secret, String otpauthUri) {

    @Override
    public String toString() {
        return "SecondFactorEnrolment[secret=***, otpauthUri=***]";
    }
}

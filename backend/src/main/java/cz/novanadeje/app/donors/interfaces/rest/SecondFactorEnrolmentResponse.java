package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SecondFactorEnrolment;

record SecondFactorEnrolmentResponse(String secret, String otpauthUri) {

    static SecondFactorEnrolmentResponse of(SecondFactorEnrolment enrolment) {
        return new SecondFactorEnrolmentResponse(enrolment.secret(), enrolment.otpauthUri());
    }

    @Override
    public String toString() {
        return "SecondFactorEnrolmentResponse[secret=***, otpauthUri=***]";
    }
}

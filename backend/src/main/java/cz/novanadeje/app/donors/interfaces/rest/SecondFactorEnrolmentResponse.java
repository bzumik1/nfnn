package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SecondFactorEnrolment;

record SecondFactorEnrolmentResponse(String secret, String otpauthUri, QrCodeResponse qrCode) {

    static SecondFactorEnrolmentResponse of(SecondFactorEnrolment enrolment) {
        return new SecondFactorEnrolmentResponse(enrolment.secret(), enrolment.otpauthUri(),
                new QrCodeResponse(enrolment.qrModules().size(), enrolment.qrModules().modules()));
    }

    @Override
    public String toString() {
        return "SecondFactorEnrolmentResponse[secret=***, otpauthUri=***, qrCode=***]";
    }

    record QrCodeResponse(int size, String modules) {
    }
}

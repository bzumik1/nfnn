package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.SecondFactorEnrolment;

import java.util.Base64;

record SecondFactorEnrolmentResponse(String secret, String otpauthUri, String qrPngBase64) {

    static SecondFactorEnrolmentResponse of(SecondFactorEnrolment enrolment) {
        return new SecondFactorEnrolmentResponse(enrolment.secret(), enrolment.otpauthUri(), Base64.getEncoder().encodeToString(enrolment.qrPng()));
    }
}

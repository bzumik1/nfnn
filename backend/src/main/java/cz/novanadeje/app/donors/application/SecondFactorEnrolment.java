package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.application.qr.QrMatrix;

public record SecondFactorEnrolment(String secret, String otpauthUri, QrMatrix qrModules) {

    @Override
    public String toString() {
        return "SecondFactorEnrolment[secret=***, otpauthUri=***, qrModules=***]";
    }
}

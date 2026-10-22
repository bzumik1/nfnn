package cz.novanadeje.app.donors.application;

public record SecondFactorEnrolment(String secret, String otpauthUri, byte[] qrPng) {
}

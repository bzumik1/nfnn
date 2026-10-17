package cz.novanadeje.app.donations.application;

public interface QrCodeRenderer {

    byte[] renderPng(String payload, int sizePx);
}

package cz.novanadeje.app.shared.application.qr;

public interface QrCodeRenderer {

    byte[] renderPng(String payload, int sizePx);
}

package cz.novanadeje.app.shared.application.qr;

public interface QrCodeEncoder {

    QrMatrix encode(String payload, QrErrorCorrection errorCorrection);
}

package cz.novanadeje.app.donations.infrastructure.qr;

import cz.novanadeje.app.donations.QrCodes;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

class ZxingQrCodeRendererTest {

    private static final String SPAYD = "SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE";

    private final ZxingQrCodeRenderer renderer = new ZxingQrCodeRenderer();

    @Test
    void should_produce_a_png_that_scans_back_to_the_payload_when_rendered() {
        byte[] png = renderer.renderPng(SPAYD, 300);

        assertThat(QrCodes.isPng(png)).isTrue();
        assertThat(QrCodes.decode(png)).isEqualTo(SPAYD);
    }

    @Test
    void should_produce_a_square_image_of_the_requested_size_when_rendered() throws IOException {
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(renderer.renderPng(SPAYD, 300)));

        assertThat(image.getWidth()).isEqualTo(300);
        assertThat(image.getHeight()).isEqualTo(300);
    }
}

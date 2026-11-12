package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.shared.application.people.PrintSignature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PrintSignaturesTest {

    private static final Color INK = new Color(20, 40, 120);

    @Test
    @DisplayName("Given a signature wider than a receipt takes, when prepared for print, then it is a PNG scaled down to 1200 px wide in its own proportions")
    void should_scale_down_when_prepared_given_wide_signature() throws IOException {
        PrintSignature signature = PrintSignatures.prepare(variantOf(signature(3000, 1000)));

        BufferedImage printed = decoded(signature);
        assertThat(signature.width()).isEqualTo(1200);
        assertThat(signature.height()).isEqualTo(400);
        assertThat(printed.getWidth()).isEqualTo(1200);
        assertThat(printed.getHeight()).isEqualTo(400);
    }

    @Test
    @DisplayName("Given a signature taller than a receipt takes, when prepared for print, then it is scaled down to 600 px high in its own proportions")
    void should_scale_down_to_height_when_prepared_given_tall_signature() throws IOException {
        PrintSignature signature = PrintSignatures.prepare(variantOf(signature(400, 900)));

        assertThat(signature.height()).isEqualTo(600);
        assertThat(signature.width()).isEqualTo(267);
        assertThat(decoded(signature).getHeight()).isEqualTo(600);
    }

    @Test
    @DisplayName("Given a signature smaller than a receipt takes, when prepared for print, then it keeps its size")
    void should_keep_size_when_prepared_given_small_signature() throws IOException {
        PrintSignature signature = PrintSignatures.prepare(variantOf(signature(300, 100)));

        assertThat(signature.width()).isEqualTo(300);
        assertThat(signature.height()).isEqualTo(100);
        assertThat(decoded(signature).getWidth()).isEqualTo(300);
    }

    @Test
    @DisplayName("Given ink on a white background, when prepared for print, then it is a PNG without an alpha channel, which the browser's PDF library embeds, in the colours it was uploaded in")
    void should_keep_white_and_ink_without_alpha_when_prepared_given_ink_on_white() throws IOException {
        BufferedImage printed = decoded(PrintSignatures.prepare(variantOf(signature(300, 100))));

        Color background = new Color(printed.getRGB(5, 5));
        Color ink = new Color(printed.getRGB(150, 50));
        assertThat(printed.getColorModel().hasAlpha()).isFalse();
        assertThat(background).isEqualTo(Color.WHITE);
        assertThat(Math.abs(ink.getRed() - INK.getRed())).isLessThan(12);
        assertThat(Math.abs(ink.getGreen() - INK.getGreen())).isLessThan(12);
        assertThat(Math.abs(ink.getBlue() - INK.getBlue())).isLessThan(12);
    }

    @Test
    @DisplayName("Given the same signature twice, when prepared for print, then both give the same bytes")
    void should_give_same_bytes_when_prepared_twice_given_same_signature() {
        MediaVariant variant = variantOf(signature(600, 200));

        assertThat(PrintSignatures.prepare(variant).png()).isEqualTo(PrintSignatures.prepare(variant).png());
    }

    @Test
    @DisplayName("Given stored bytes that are no image, when prepared for print, then it is refused as undecodable")
    void should_refuse_when_prepared_given_undecodable_bytes() {
        assertThatThrownBy(() -> PrintSignatures.prepare(new MediaVariant(600, 200, new byte[] {1, 2, 3, 4})))
                .isInstanceOf(IllegalStateException.class);
    }

    private static BufferedImage signature(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(INK);
        graphics.fillRect(width / 4, height * 2 / 5, width / 2, height / 5);
        graphics.dispose();
        return image;
    }

    private static MediaVariant variantOf(BufferedImage image) {
        try {
            ByteArrayOutputStream webp = new ByteArrayOutputStream();
            ImageIO.write(image, "webp", webp);
            return new MediaVariant(image.getWidth(), image.getHeight(), webp.toByteArray());
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static BufferedImage decoded(PrintSignature signature) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(signature.png()));
    }
}

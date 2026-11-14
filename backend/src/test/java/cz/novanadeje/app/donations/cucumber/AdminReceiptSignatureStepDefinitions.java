package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminReceiptSignatureStepDefinitions {

    private static final String ADMIN_MEDIA = "/api/admin/content/media";
    private static final String PEOPLE = "/api/admin/content/people/";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;

    public AdminReceiptSignatureStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
    }

    @Given("{string} has set a {int} by {int} pixel scan as the signature of the person who signs the receipts")
    @When("{string} sets a {int} by {int} pixel scan as the signature of the person who signs the receipts")
    public void setsAScanAsTheSignatureOfTheSignatory(String alias, int width, int height) {
        sessions.actAs(alias);
        UUID signatory = jdbc.sql("select person_id from donation_receipt_signatory").query(UUID.class).single();
        api.postFile(ADMIN_MEDIA, "file", "podpis.jpg", "image/jpeg", jpeg(width, height));
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The scan was not uploaded: %s", api.lastResponse().getBody())
                .isEqualTo(201);
        api.post(PEOPLE + signatory + "/signature", Map.of("imageId", api.lastResponseJson().get("id").asString()));
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The signature was not set: %s", api.lastResponse().getBody())
                .isEqualTo(200);
    }

    private static byte[] jpeg(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(new Color(0x1d, 0x2a, 0x5c));
        graphics.fillRect(width / 4, height / 2 - 3, width / 2, 6);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException impossible) {
            throw new UncheckedIOException(impossible);
        }
        return out.toByteArray();
    }
}

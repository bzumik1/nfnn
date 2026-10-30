package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminReceiptSignatureStepDefinitions {

    private static final String SIGNATURE = "/api/admin/donations/receipt-signature";
    private static final String PNG_DATA_URI = "data:image/png;base64,";

    private final ApiClient api;
    private final DonorSessions sessions;

    public AdminReceiptSignatureStepDefinitions(ApiClient api, DonorSessions sessions) {
        this.api = api;
        this.sessions = sessions;
    }

    @When("{string} asks for the receipt signature")
    public void asksForTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.get(SIGNATURE);
    }

    @When("someone without a token asks for the receipt signature")
    public void someoneWithoutATokenAsksForTheReceiptSignature() {
        api.forgetCredentials();
        api.get(SIGNATURE);
    }

    @When("{string} uploads a {int} by {int} pixel JPEG scan named {string} as the receipt signature")
    public void uploadsAJpegScanAsTheReceiptSignature(String alias, int width, int height, String fileName) {
        sessions.actAs(alias);
        api.postFile(SIGNATURE, "file", fileName, "image/jpeg", jpeg(width, height));
    }

    @When("{string} uploads a text file as the receipt signature")
    public void uploadsATextFileAsTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.postFile(SIGNATURE, "file", "podpis.txt", "text/plain", "Josef Dvořáček".getBytes(StandardCharsets.UTF_8));
    }

    @When("{string} removes the receipt signature")
    public void removesTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.delete(SIGNATURE);
    }

    @Then("the receipt signature is not set")
    public void theReceiptSignatureIsNotSet() {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("configured").asBoolean()).isFalse();
        assertThat(response.get("image").isNull()).isTrue();
        assertThat(response.get("uploadedAt").isNull()).isTrue();
    }

    @Then("the receipt signature is set, {int} by {int} pixels, uploaded at {string}")
    public void theReceiptSignatureIsSet(int width, int height, String uploadedAt) throws IOException {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("configured").asBoolean()).isTrue();
        assertThat(response.get("width").asInt()).isEqualTo(width);
        assertThat(response.get("height").asInt()).isEqualTo(height);
        assertThat(response.get("uploadedAt").asString()).isEqualTo(uploadedAt);
        String image = response.get("image").asString();
        assertThat(image).startsWith(PNG_DATA_URI);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(image.substring(PNG_DATA_URI.length()))));
        assertThat(decoded.getWidth()).isEqualTo(width);
        assertThat(decoded.getHeight()).isEqualTo(height);
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

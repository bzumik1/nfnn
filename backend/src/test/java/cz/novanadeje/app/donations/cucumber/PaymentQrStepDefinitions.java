package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.shared.QrCodes;
import io.cucumber.java.en.And;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

public class PaymentQrStepDefinitions {

    private static final String PAYMENT_QR_PATH = "/api/donations/payment-qr";

    private final ApiClient api;

    public PaymentQrStepDefinitions(ApiClient api) {
        this.api = api;
    }

    @When("the visitor asks for a QR payment of {int} CZK")
    public void theVisitorAsksForAQrPaymentOf(int amount) {
        api.get(PAYMENT_QR_PATH + "?amount=" + amount);
    }

    @When("the visitor asks for a QR payment of {int} CZK with variable symbol {string}")
    public void theVisitorAsksForAQrPaymentWithVariableSymbol(int amount, String variableSymbol) {
        api.get(PAYMENT_QR_PATH + "?amount=" + amount + "&variableSymbol=" + variableSymbol);
    }

    @When("the visitor asks for a QR payment with amount {string}")
    public void theVisitorAsksForAQrPaymentWithAmount(String amount) {
        api.get(PAYMENT_QR_PATH + "?amount=" + amount);
    }

    @When("the visitor asks for a QR payment with parameters {string}")
    public void theVisitorAsksForAQrPaymentWithParameters(String query) {
        api.get(PAYMENT_QR_PATH + "?" + query);
    }

    @When("the visitor asks for a QR payment without an amount")
    public void theVisitorAsksForAQrPaymentWithoutAnAmount() {
        api.get(PAYMENT_QR_PATH);
    }

    @And("the QR payment reads {string}")
    public void theQrPaymentReads(String spayd) {
        assertThat(spayd()).isEqualTo(spayd);
    }

    @And("the QR payment contains {string}")
    public void theQrPaymentContains(String fragment) {
        assertThat(spayd()).startsWith("SPD*1.0*").contains(fragment);
    }

    @And("the QR payment has no variable symbol")
    public void theQrPaymentHasNoVariableSymbol() {
        assertThat(spayd()).doesNotContain("X-VS:");
    }

    @And("the QR code is a PNG image that encodes the QR payment")
    public void theQrCodeIsAPngImageThatEncodesTheQrPayment() {
        byte[] png = Base64.getDecoder().decode(api.lastResponseJson().get("qrPngBase64").asString());
        assertThat(QrCodes.isPng(png)).isTrue();
        assertThat(QrCodes.decode(png)).isEqualTo(spayd());
    }

    @And("the foundation's bank account is {string} with IBAN {string} held by {string}")
    public void theFoundationsBankAccountIs(String accountNumber, String iban, String recipientName) {
        JsonNode bankAccount = api.lastResponseJson().get("bankAccount");
        assertThat(bankAccount.get("accountNumber").asString()).isEqualTo(accountNumber);
        assertThat(bankAccount.get("iban").asString()).isEqualTo(iban);
        assertThat(bankAccount.get("recipientName").asString()).isEqualTo(recipientName);
    }

    private String spayd() {
        return api.lastResponseJson().get("spayd").asString();
    }
}

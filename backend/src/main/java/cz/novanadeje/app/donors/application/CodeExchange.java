package cz.novanadeje.app.donors.application;

public record CodeExchange(String code, String clientId, String redirectUri, String codeVerifier, String resource) {

    @Override
    public String toString() {
        return "CodeExchange[code=***, clientId=" + clientId + ", redirectUri=" + redirectUri + ", codeVerifier=***, resource=" + resource + "]";
    }
}

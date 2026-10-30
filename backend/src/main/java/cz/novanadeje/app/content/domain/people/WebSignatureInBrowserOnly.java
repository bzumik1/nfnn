package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class WebSignatureInBrowserOnly extends AccessDenied {

    public static final String CODE = "content/web-signature-in-browser-only";

    public WebSignatureInBrowserOnly() {
        super(CODE, "A web signature is set and removed only in the administration in a browser, never through a connected application");
    }
}

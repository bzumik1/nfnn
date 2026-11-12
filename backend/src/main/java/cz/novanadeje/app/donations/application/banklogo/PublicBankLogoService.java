package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageNotFound;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PublicBankLogoService {

    private final BankLogoRepository logos;

    public PublicBankLogoService(BankLogoRepository logos) {
        this.logos = logos;
    }

    @Transactional(readOnly = true)
    public List<PublishedBankLogo> published() {
        return logos.findAll().stream().filter(logo -> logo.source().allowed())
                .flatMap(logo -> logo.image().map(image -> new PublishedBankLogo(logo.code().value(), image.id().value())).stream())
                .toList();
    }

    @Transactional(readOnly = true)
    public byte[] image(BankLogoImageId id) {
        return logos.imageWebp(id).orElseThrow(BankLogoImageNotFound::new);
    }
}

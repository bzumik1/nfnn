package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

interface ReceiptSignatureJpaRepository extends JpaRepository<ReceiptSignatureJpaEntity, UUID> {

    @Query("select s.personId as personId, i.mediaType as mediaType, s.width as width, s.height as height, s.uploadedAt as uploadedAt "
            + "from ReceiptSignatureJpaEntity s join ReceiptImageJpaEntity i on i.sha256 = s.imageSha256 order by s.uploadedAt, s.personId")
    List<SignatureRow> summaries();

    interface SignatureRow {

        UUID getPersonId();

        String getMediaType();

        short getWidth();

        short getHeight();

        Instant getUploadedAt();
    }
}

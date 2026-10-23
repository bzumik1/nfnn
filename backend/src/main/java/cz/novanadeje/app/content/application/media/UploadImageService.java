package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;

@Service
public class UploadImageService {

    private static final Logger log = LoggerFactory.getLogger(UploadImageService.class);

    private final ImageProcessor processor;
    private final MediaImageRepository media;
    private final TransactionTemplate transaction;
    private final Clock clock;

    public UploadImageService(ImageProcessor processor, MediaImageRepository media, TransactionTemplate transaction, Clock clock) {
        this.processor = processor;
        this.media = media;
        this.transaction = transaction;
        this.clock = clock;
    }

    public UploadedImage upload(byte[] upload) {
        ProcessedImage processed = processor.process(upload);
        Instant now = clock.instant();
        MediaImage image = new MediaImage(MediaId.newId(now), processed.width(), processed.height(), processed.variants(), now);
        transaction.executeWithoutResult(status -> media.save(image));
        log.info("Image {} stored: {}x{} as {} variants", image.id(), image.width(), image.height(), image.variants().size());
        return new UploadedImage(image.id(), image.width(), image.height());
    }
}

package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.media.UploadImageService;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/admin/content/media")
class AdminMediaController {

    private final UploadImageService uploads;

    AdminMediaController(UploadImageService uploads) {
        this.uploads = uploads;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    UploadedImageResponse upload(@RequestPart("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new UnsupportedImage("it is empty");
        }
        try {
            return UploadedImageResponse.from(uploads.upload(file.getBytes()));
        } catch (IOException unreadable) {
            throw new UnsupportedImage("it could not be read");
        }
    }
}

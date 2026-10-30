package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectCommand;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Optional;
import java.util.UUID;

public record ProjectRequest(
        @NotBlank @Size(max = ProjectContent.MAX_TITLE_LENGTH) String title,
        @NotNull @Min(ProjectContent.MIN_YEAR) @Max(ProjectContent.MAX_YEAR) Integer year,
        @Pattern(regexp = ProjectCategory.NAMES_PATTERN) String category,
        @Size(max = Slug.MAX_LENGTH) @Pattern(regexp = "^$|" + Slug.SHAPE_REGEX) String slug,
        @Size(max = ProjectContent.MAX_TAG_LENGTH) String tag,
        @NotBlank @Size(max = ProjectContent.MAX_PEREX_LENGTH) String perex,
        @NotBlank @Size(max = ProjectContent.MAX_BODY_LENGTH) String body,
        UUID coverImageId,
        @Size(max = ProjectContent.MAX_COVER_IMAGE_ALT_LENGTH) String coverImageAlt) {

    ProjectCommand toCommand() {
        return new ProjectCommand(title, year, Optional.ofNullable(category).map(ProjectCategory::valueOf).orElse(ProjectCategory.OTHER), Optional.ofNullable(slug), Optional.ofNullable(tag), perex, body,
                Optional.ofNullable(coverImageId).map(MediaId::new), Optional.ofNullable(coverImageAlt));
    }
}

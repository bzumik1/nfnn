package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.logs.LogReadingService;
import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogReadLimits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@Validated
@RequestMapping("/api/admin/operations/logs")
class AdminLogsController {

    private final LogReadingService logs;

    AdminLogsController(LogReadingService logs) {
        this.logs = logs;
    }

    @GetMapping
    LogFilesResponse files() {
        return LogFilesResponse.from(logs.files());
    }

    @GetMapping("/{name}")
    LogWindowResponse read(@PathVariable @Size(max = LogFile.MAX_NAME_LENGTH) String name,
                           @RequestParam(required = false) @Min(0) Long from,
                           @RequestParam(required = false) @Min(1) @Max(LogReadLimits.MAX_WINDOW_BYTES) Integer bytes) {
        return LogWindowResponse.from(logs.read(name, Optional.ofNullable(from), bytes));
    }

    @GetMapping("/{name}/search")
    LogSearchResponse search(@PathVariable @Size(max = LogFile.MAX_NAME_LENGTH) String name,
                             @RequestParam @NotBlank @Size(max = LogReadLimits.MAX_PATTERN_LENGTH) String pattern,
                             @RequestParam(required = false) @Min(1) @Max(LogReadLimits.MAX_MATCHES) Integer limit,
                             @RequestParam(required = false) @Min(0) Long before) {
        return LogSearchResponse.from(logs.search(name, pattern, limit, Optional.ofNullable(before)));
    }
}

package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

final class UserAgentDevice {

    private static final int MAXIMUM_READ_LENGTH = 512;

    private static final List<Map.Entry<Pattern, DevicePlatform>> PLATFORMS = List.of(
            Map.entry(Pattern.compile("iPhone|iPod"), DevicePlatform.IPHONE),
            Map.entry(Pattern.compile("iPad"), DevicePlatform.IPAD),
            Map.entry(Pattern.compile("Android"), DevicePlatform.ANDROID),
            Map.entry(Pattern.compile("CrOS"), DevicePlatform.CHROMEBOOK),
            Map.entry(Pattern.compile("Macintosh|Mac OS X"), DevicePlatform.MAC),
            Map.entry(Pattern.compile("Windows"), DevicePlatform.WINDOWS),
            Map.entry(Pattern.compile("Linux"), DevicePlatform.LINUX));

    private static final List<Map.Entry<Pattern, DeviceBrowser>> BROWSERS = List.of(
            Map.entry(Pattern.compile("Edg(e|A|iOS)?/"), DeviceBrowser.EDGE),
            Map.entry(Pattern.compile("Firefox/|FxiOS/"), DeviceBrowser.FIREFOX),
            Map.entry(Pattern.compile("Chrome/|CriOS/|Chromium/"), DeviceBrowser.CHROME),
            Map.entry(Pattern.compile("Safari/"), DeviceBrowser.SAFARI));

    private UserAgentDevice() {
    }

    static DeviceDescription of(HttpServletRequest request) {
        return of(request.getHeader(HttpHeaders.USER_AGENT));
    }

    static DeviceDescription of(String userAgent) {
        return DeviceDescription.UNKNOWN;
    }
}

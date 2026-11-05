package cz.novanadeje.app.donors.domain;

public record DeviceDescription(DevicePlatform platform, DeviceBrowser browser) {

    public static final DeviceDescription UNKNOWN = new DeviceDescription(DevicePlatform.OTHER, DeviceBrowser.OTHER);

    public DeviceDescription {
        if (platform == null || browser == null) {
            throw new IllegalArgumentException("A device description needs its platform and browser");
        }
    }
}

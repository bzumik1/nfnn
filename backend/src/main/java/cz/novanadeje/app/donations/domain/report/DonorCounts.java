package cz.novanadeje.app.donations.domain.report;

public record DonorCounts(long registered, long newInMonth) {

    public DonorCounts {
        if (newInMonth < 0 || newInMonth > registered) {
            throw new IllegalArgumentException("New donors are part of the registered ones: " + newInMonth + " of " + registered);
        }
    }

    public static DonorCounts between(long registeredBeforeMonth, long registeredByMonthEnd) {
        if (registeredBeforeMonth < 0) {
            throw new IllegalArgumentException("Donors registered before the month cannot be negative: " + registeredBeforeMonth);
        }
        return new DonorCounts(registeredByMonthEnd, registeredByMonthEnd - registeredBeforeMonth);
    }
}

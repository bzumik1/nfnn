package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

record OffsetPage(long offset, int size) implements Pageable {

    OffsetPage {
        if (offset < 0 || size < 1) {
            throw new IllegalArgumentException("An offset page starts at zero or later and holds at least one row");
        }
    }

    @Override
    public int getPageNumber() {
        return (int) (offset / size);
    }

    @Override
    public int getPageSize() {
        return size;
    }

    @Override
    public long getOffset() {
        return offset;
    }

    @Override
    public Sort getSort() {
        return Sort.unsorted();
    }

    @Override
    public Pageable next() {
        return new OffsetPage(offset + size, size);
    }

    @Override
    public Pageable previousOrFirst() {
        return hasPrevious() ? new OffsetPage(Math.max(0, offset - size), size) : first();
    }

    @Override
    public Pageable first() {
        return new OffsetPage(0, size);
    }

    @Override
    public Pageable withPage(int pageNumber) {
        return new OffsetPage((long) pageNumber * size, size);
    }

    @Override
    public boolean hasPrevious() {
        return offset > 0;
    }
}

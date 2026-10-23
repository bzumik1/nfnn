package cz.novanadeje.app.operations.infrastructure.logs;

import cz.novanadeje.app.operations.domain.logs.LogSearchTooSlow;

record DeadlineCharSequence(CharSequence text, long deadlineNanos) implements CharSequence {

    @Override
    public char charAt(int index) {
        if (System.nanoTime() - deadlineNanos > 0) {
            throw new LogSearchTooSlow();
        }
        return text.charAt(index);
    }

    @Override
    public int length() {
        return text.length();
    }

    @Override
    public CharSequence subSequence(int start, int end) {
        return new DeadlineCharSequence(text.subSequence(start, end), deadlineNanos);
    }

    @Override
    public String toString() {
        return text.toString();
    }
}

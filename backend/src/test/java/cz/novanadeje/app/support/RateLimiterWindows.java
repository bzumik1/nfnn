package cz.novanadeje.app.support;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.util.ClassUtils;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

public final class RateLimiterWindows {

    private static final String RATE_LIMITER = "RateLimiter";
    private static final String CAFFEINE_CACHE = "com.github.benmanes.caffeine.cache.Cache";

    private RateLimiterWindows() {
    }

    public static int reset(ConfigurableApplicationContext context) {
        var beans = context.getBeanFactory();
        List<Object> singletons = Arrays.stream(beans.getSingletonNames()).map(beans::getSingleton).filter(Objects::nonNull).toList();
        return reset(singletons);
    }

    public static int reset(Collection<?> beans) {
        int reset = 0;
        for (Object bean : beans) {
            List<FixedWindowRateLimiter> limiters = limitersOf(bean);
            Class<?> type = ClassUtils.getUserClass(bean);
            if (limiters.isEmpty() && type != FixedWindowRateLimiter.class && type.getSimpleName().endsWith(RATE_LIMITER)) {
                throw new IllegalStateException("The bean " + type.getName() + " holds no FixedWindowRateLimiter that RateLimiterWindows can read, "
                        + "so its windows would survive into the next scenario; adapt RateLimiterWindows");
            }
            for (FixedWindowRateLimiter limiter : limiters) {
                invalidateWindows(limiter);
                reset++;
            }
        }
        if (reset == 0) {
            throw new IllegalStateException("No FixedWindowRateLimiter found among the beans, so the recording cannot reset the rate-limit windows");
        }
        return reset;
    }

    private static List<FixedWindowRateLimiter> limitersOf(Object bean) {
        if (bean instanceof FixedWindowRateLimiter limiter) {
            return List.of(limiter);
        }
        return fieldsOf(bean.getClass()).stream()
                .filter(field -> field.getType() == FixedWindowRateLimiter.class)
                .map(field -> (FixedWindowRateLimiter) read(field, bean))
                .filter(Objects::nonNull)
                .toList();
    }

    private static void invalidateWindows(FixedWindowRateLimiter limiter) {
        try {
            Class<?> cache = Class.forName(CAFFEINE_CACHE);
            Method invalidateAll = cache.getMethod("invalidateAll");
            List<Field> caches = fieldsOf(FixedWindowRateLimiter.class).stream().filter(field -> field.getType() == cache).toList();
            if (caches.isEmpty()) {
                throw new IllegalStateException("FixedWindowRateLimiter keeps its windows in no Caffeine cache any more; adapt RateLimiterWindows");
            }
            for (Field field : caches) {
                invalidateAll.invoke(read(field, limiter));
            }
        } catch (ClassNotFoundException | NoSuchMethodException | IllegalAccessException | InvocationTargetException unreachable) {
            throw new IllegalStateException("The rate-limit windows cannot be reset", unreachable);
        }
    }

    private static List<Field> fieldsOf(Class<?> type) {
        return type == null || type == Object.class ? List.of()
                : Stream.concat(Arrays.stream(type.getDeclaredFields()), fieldsOf(type.getSuperclass()).stream()).toList();
    }

    private static Object read(Field field, Object owner) {
        try {
            field.setAccessible(true);
            return field.get(owner);
        } catch (IllegalAccessException | RuntimeException unreadable) {
            return null;
        }
    }
}

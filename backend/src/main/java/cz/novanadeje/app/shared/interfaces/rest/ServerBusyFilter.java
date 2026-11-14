package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.security.autoconfigure.web.servlet.SecurityFilterProperties;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.LocaleResolver;

import java.io.IOException;

@Component
@Order(SecurityFilterProperties.DEFAULT_FILTER_ORDER - 1)
class ServerBusyFilter extends OncePerRequestFilter {

    private final HandlerExceptionResolver exceptionHandlers;
    private final LocaleResolver locales;

    ServerBusyFilter(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionHandlers, LocaleResolver locales) {
        this.exceptionHandlers = exceptionHandlers;
        this.locales = locales;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } catch (RuntimeException failure) {
            if (!ServerBusyHandler.isDatabaseWait(failure) || response.isCommitted()) {
                throw failure;
            }
            if (!answeredBusy(request, response, failure)) {
                throw failure;
            }
        }
    }

    private boolean answeredBusy(HttpServletRequest request, HttpServletResponse response, RuntimeException failure) {
        LocaleContext previous = LocaleContextHolder.getLocaleContext();
        LocaleContextHolder.setLocale(locales.resolveLocale(request));
        try {
            response.resetBuffer();
            return exceptionHandlers.resolveException(request, response, null, failure) != null;
        } finally {
            LocaleContextHolder.setLocaleContext(previous);
        }
    }
}

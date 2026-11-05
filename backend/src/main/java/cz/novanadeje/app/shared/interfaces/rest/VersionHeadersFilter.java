package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
class VersionHeadersFilter extends OncePerRequestFilter {

    static final int API_GENERATION = 1;
    static final String REVISION_HEADER = "Nfnn-Revision";
    static final String API_HEADER = "Nfnn-Api";
    private static final String API_PATH = "/api/";

    private final BuildProperties build;

    VersionHeadersFilter(BuildProperties build) {
        this.build = build;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(API_PATH);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(request, response);
    }
}

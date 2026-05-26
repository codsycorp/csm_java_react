package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Resolves {@link AiRetrievalAuthContext} from the current Spring Security principal.
 */
@Service
public class AiRetrievalAuthContextResolver {

    @Value("${ai.retrieval.auth.filter-enabled:true}")
    private boolean filterEnabled;

    public AiRetrievalAuthContext resolveCurrent() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
            || !authentication.isAuthenticated()
            || authentication.getPrincipal() == null
            || "anonymousUser".equals(authentication.getPrincipal())) {
            return AiRetrievalAuthContext.ANONYMOUS;
        }
        return AiRetrievalAuthContext.fromPrincipal(authentication.getPrincipal(), filterEnabled);
    }
}

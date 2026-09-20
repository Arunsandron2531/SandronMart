package com.sandronmart;

import com.sandronmart.enums.Role;
import com.sandronmart.model.User;
import com.sandronmart.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import org.springframework.mock.web.MockHttpSession;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthenticationModuleTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    @BeforeEach
    void cleanDatabase() {
        userRepository.deleteAll();
    }

    private String csrfToken(MvcResult result) throws Exception {
        String html = result.getResponse().getContentAsString();
        Matcher m = Pattern
                .compile("name=\"_csrf\" value=\"([^\"]+)\"")
                .matcher(html);
        return m.find() ? m.group(1) : null;
    }

    @Test
    void homePageLoadsForAnonymousUsers() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(view().name("home"))
                .andExpect(content().string(containsString("SANDRONMART")))
                .andExpect(content().string(containsString("Plants &amp; Gardening Marketplace")));
    }

    @Test
    void loginPageLoads() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Login")))
                .andExpect(content().string(containsString("Forgot Password?")))
                .andExpect(content().string(containsString("Create Account")));
    }

    @Test
    void registerPageLoads() throws Exception {
        mockMvc.perform(get("/register"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Create Account")))
                .andExpect(content().string(containsString("Full Name")));
    }

    @Test
    void dashboardsRedirectAnonymousUsersToLogin() throws Exception {
        mockMvc.perform(get("/buyer/dashboard"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
        mockMvc.perform(get("/seller/dashboard"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    @Test
    void registrationCreatesUserWithHashedBcryptPassword() throws Exception {
        MvcResult page = mockMvc.perform(get("/register")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/register")
                        .with(csrf().asHeader())
                        .param("fullName", "Jane Buyer")
                        .param("email", "jane@example.com")
                        .param("phoneNumber", "+254712345678")
                        .param("password", "gardener123")
                        .param("confirmPassword", "gardener123")
                        .param("role", "BUYER"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?registered=true"));

        User u = userRepository.findByEmail("jane@example.com").orElseThrow();
        assertThat(u.getRole()).isEqualTo(Role.BUYER);
        assertThat(u.getPassword()).isNotEqualTo("gardener123");
        assertThat(passwordEncoder.matches("gardener123", u.getPassword())).isTrue();
    }

    @Test
    void registrationRejectsDuplicateEmail() throws Exception {
        userRepository.save(new User("Existing", "dup@example.com", "+254700000000",
                passwordEncoder.encode("password1"), Role.BUYER));

        MvcResult page = mockMvc.perform(get("/register")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/register")
                        .with(csrf().asHeader())
                        .param("fullName", "New User")
                        .param("email", "DUP@example.com")
                        .param("phoneNumber", "+254711111111")
                        .param("password", "password1")
                        .param("confirmPassword", "password1")
                        .param("role", "SELLER"))
                .andExpect(status().isOk())
                .andExpect(view().name("register"))
                .andExpect(content().string(containsString("An account with this email already exists")));
    }

    @Test
    void registrationValidatesRequiredFields() throws Exception {
        MvcResult page = mockMvc.perform(get("/register")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/register")
                        .with(csrf().asHeader())
                        .param("fullName", "")
                        .param("email", "not-an-email")
                        .param("phoneNumber", "abc")
                        .param("password", "123")
                        .param("confirmPassword", "456")
                        .param("role", "BUYER"))
                .andExpect(status().isOk())
                .andExpect(view().name("register"))
                .andExpect(content().string(containsString("Full name is required")))
                .andExpect(content().string(containsString("Please enter a valid email address")))
                .andExpect(content().string(containsString("Please enter a valid phone number")))
                .andExpect(content().string(containsString("Password must be at least 8 characters")))
                .andExpect(content().string(containsString("Passwords do not match")));

        assertThat(userRepository.count()).isZero();
    }

    @Test
    void buyerLoginRedirectsToBuyerDashboard() throws Exception {
        createUser("buyer@example.com", "buyerpass1", Role.BUYER);

        MvcResult page = mockMvc.perform(get("/login")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/login")
                        .with(csrf().asHeader())
                        .param("username", "buyer@example.com")
                        .param("password", "buyerpass1"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/buyer/dashboard"));
    }

    @Test
    void sellerLoginRedirectsToSellerDashboard() throws Exception {
        createUser("seller@example.com", "sellerpass1", Role.SELLER);

        MvcResult page = mockMvc.perform(get("/login")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/login")
                        .with(csrf().asHeader())
                        .param("username", "seller@example.com")
                        .param("password", "sellerpass1"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/seller/dashboard"));
    }

    @Test
    void invalidCredentialsShowError() throws Exception {
        createUser("buyer@example.com", "buyerpass1", Role.BUYER);

        MvcResult page = mockMvc.perform(get("/login")).andReturn();
        String token = csrfToken(page);

        mockMvc.perform(post("/login")
                        .with(csrf().asHeader())
                        .param("username", "buyer@example.com")
                        .param("password", "wrongpassword"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?error"));

        mockMvc.perform(get("/login").param("error", ""))
                .andExpect(content().string(containsString("Invalid email or password")));
    }

    @Test
    void buyersCannotAccessSellerDashboard() throws Exception {
        createUser("buyer2@example.com", "buyerpass1", Role.BUYER);
        MockHttpSession session = loginSession("buyer2@example.com", "buyerpass1");

        mockMvc.perform(get("/buyer/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("SANDRONMART Buyer Dashboard")));

        mockMvc.perform(get("/seller/dashboard").session(session))
                .andExpect(status().isForbidden());
    }

    @Test
    void sellersCannotAccessBuyerDashboard() throws Exception {
        createUser("seller2@example.com", "sellerpass1", Role.SELLER);
        MockHttpSession session = loginSession("seller2@example.com", "sellerpass1");

        mockMvc.perform(get("/seller/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("SANDRONMART Seller Dashboard")));

        mockMvc.perform(get("/buyer/dashboard").session(session))
                .andExpect(status().isForbidden());
    }

    private MockHttpSession loginSession(String email, String password) throws Exception {
        MvcResult loginPage = mockMvc.perform(get("/login")).andReturn();
        String token = csrfToken(loginPage);
        MvcResult login = mockMvc.perform(post("/login")
                        .with(csrf().asHeader())
                        .param("username", email)
                        .param("password", password))
                .andExpect(status().is3xxRedirection())
                .andReturn();
        return (MockHttpSession) login.getRequest().getSession(false);
    }

    @Test
    void logoutClearsSessionAndRedirectsToLogin() throws Exception {
        User buyer = createUser("logout@example.com", "buyerpass1", Role.BUYER);

        MvcResult login = mockMvc.perform(get("/login")).andReturn();
        String token = csrfToken(login);

        mockMvc.perform(post("/login")
                        .with(csrf().asHeader())
                        .param("username", "logout@example.com")
                        .param("password", "buyerpass1"))
                .andExpect(status().is3xxRedirection());

        mockMvc.perform(post("/logout")
                        .with(csrf())
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .user(buyer.getEmail()).roles("BUYER")))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?logout"));

        mockMvc.perform(get("/buyer/dashboard"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    private User createUser(String email, String rawPassword, Role role) {
        User u = new User("Test User", email, "+254712345679",
                passwordEncoder.encode(rawPassword), role);
        return userRepository.save(u);
    }
}
package com.sandronmart.controller;

import com.sandronmart.enums.Role;
import com.sandronmart.service.UserService;
import com.sandronmart.web.dto.RegistrationForm;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/login")
    public String login(@RequestParam(value = "error", required = false) String error,
                        @RequestParam(value = "logout", required = false) String logout,
                        @RequestParam(value = "registered", required = false) String registered,
                        Model model) {
        if (error != null) {
            model.addAttribute("errorMessage", "Invalid email or password. Please try again.");
        }
        if (logout != null) {
            model.addAttribute("successMessage", "You have been logged out successfully.");
        }
        if (registered != null) {
            model.addAttribute("successMessage", "Account created successfully. Please sign in.");
        }
        return "login";
    }

    @GetMapping("/register")
    public String showRegistrationForm(Model model) {
        model.addAttribute("form", new RegistrationForm());
        model.addAttribute("roles", Role.values());
        return "register";
    }

    @PostMapping("/register")
    public String register(@Valid @ModelAttribute("form") RegistrationForm form,
                           BindingResult bindingResult,
                           RedirectAttributes redirectAttributes,
                           Model model) {
        if (!userService.passwordsMatch(form.getPassword(), form.getConfirmPassword())) {
            bindingResult.rejectValue("confirmPassword", "password.mismatch",
                    "Passwords do not match");
        }
        if (form.getEmail() != null && !form.getEmail().isBlank() && userService.emailAlreadyExists(form.getEmail())) {
            bindingResult.rejectValue("email", "email.exists",
                    "An account with this email already exists");
        }
        if (form.getPhoneNumber() != null && !form.getPhoneNumber().isBlank()
                && userService.phoneAlreadyExists(form.getPhoneNumber())) {
            bindingResult.rejectValue("phoneNumber", "phone.exists",
                    "An account with this phone number already exists");
        }

        if (bindingResult.hasErrors()) {
            model.addAttribute("form", form);
            model.addAttribute("roles", Role.values());
            return "register";
        }

        userService.register(form);
        redirectAttributes.addAttribute("registered", "true");
        return "redirect:/login";
    }
}
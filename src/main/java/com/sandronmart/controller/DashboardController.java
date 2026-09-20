package com.sandronmart.controller;

import com.sandronmart.enums.Role;
import com.sandronmart.model.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class DashboardController {

    @GetMapping("/buyer/dashboard")
    public String buyerDashboard(@AuthenticationPrincipal User currentUser, Model model) {
        model.addAttribute("user", currentUser);
        model.addAttribute("role", Role.BUYER);
        return "buyer/dashboard";
    }

    @GetMapping("/seller/dashboard")
    public String sellerDashboard(@AuthenticationPrincipal User currentUser, Model model) {
        model.addAttribute("user", currentUser);
        model.addAttribute("role", Role.SELLER);
        return "seller/dashboard";
    }
}
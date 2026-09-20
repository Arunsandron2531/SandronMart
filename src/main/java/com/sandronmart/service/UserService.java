package com.sandronmart.service;

import com.sandronmart.model.User;
import com.sandronmart.repository.UserRepository;
import com.sandronmart.web.dto.RegistrationForm;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, BCryptPasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User register(RegistrationForm form) {
        User user = new User(
                form.getFullName().trim(),
                form.getEmail().trim().toLowerCase(),
                form.getPhoneNumber().trim(),
                passwordEncoder.encode(form.getPassword()),
                form.getRole()
        );
        return userRepository.save(user);
    }

    public boolean emailAlreadyExists(String email) {
        return userRepository.existsByEmail(email.trim().toLowerCase());
    }

    public boolean phoneAlreadyExists(String phone) {
        return userRepository.existsByPhoneNumber(phone.trim());
    }

    public boolean passwordsMatch(String password, String confirmPassword) {
        return password.equals(confirmPassword);
    }
}
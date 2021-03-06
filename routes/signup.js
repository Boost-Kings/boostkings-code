var express = require("express");
var router = express.Router();
var mongoose = require("mongoose");
var User = mongoose.model("User");

var async = require("async");
var crypto = require("crypto");
var nodemailer = require("nodemailer");
var mg = require('nodemailer-mailgun-transport');

var htmlToText = require("html-to-text");
var pug = require("pug");

router.get(
  "/",

  function(req, res, next) {
    if (req.user) {
      return res.redirect("/orders");
    } else {
      return next();
    }
  },

  function(req, res, next) {
    res.locals.transparentBar = false;
    res.locals.navId = "signup";
    res.locals.pageTitle = "Sign Up";
    return res.render("pages/signup");
  }
);

router.post(
  "/",

  function(req, res, next) {
    if (req.user) {
      return res.redirect("/");
    } else {
      return next();
    }
  },

  function(req, res, next) {
    if (req.body.password != req.body.confirm) {
      req.flash("error", "The password fields do not match. Please try again.");
      return res.redirect("/signup");
    } else {
      next();
    }
  },

  function(req, res, next) {
    newUser = new User();

    newUser.email = req.body.email;
    newUser.password = req.body.password;

    newUser.save(function(err, savedUser) {
      if (err) {
        if (err.name == "ValidationError") {
          for (field in err.errors) {
            req.flash("error", err.errors[field].message);
            return res.redirect(req.get("referer"));
          }
        } else if (err.name == "MongoError" && err.code == 11000) {
          async.waterfall(
            [
              function(done) {
                var mailgun = require('mailgun-js')({apiKey: process.env.BK_EMAIL_API, domain: process.env.BK_EMAIL_URL});

                var subject = "Boost Kings - Sign up attempt";

                var mailOptions = {
                  to: req.body.email,
                  from: `Boost Kings <${process.env.BK_EMAIL_ADDRESS}>`,
                  subject: subject,
                  replyTo: "boostkings@outlook.com",
                  html: pug.renderFile("views/emails/template.pug", {
                    subject: subject,
                    cta: {
                      url: process.env.HOST + "/forgot",
                      message: "Reset my password",
                    },
                    paragraphs: [
                      "Hi there,",
                      "Someone tried to sign up for a Boost Kings account using your email address (" +
                        req.body.email +
                        ").",
                      "If you have a Boost Kings account with this address, secure your account by resetting your password.",
                    ],
                  })
                };

                mailgun.messages().send(mailOptions, function(err, body) {
                  req.flash("info", "An email has been sent to " + req.body.email + " with further instructions.");
                  done(err);
                });
              },
            ],
            function(err) {
              if (err) return next(err);
              return res.redirect("/verify");
            }
          );
        } else {
          req.flash("error", "There was a problem during the signup process. Please try again.");
          return res.redirect(req.get("referer"));
        }
      } else if (savedUser) {
        async.waterfall(
          [
            function(done) {
              crypto.randomBytes(50, function(err, buf) {
                var token = buf.toString("hex");
                done(err, token);
              });
            },
            function(token, done) {
              User.findOne({ email: savedUser.email }, function(err, user) {
                if (!user) {
                  req.flash("error", "No account with that email address exists.");
                  return res.redirect("/signup");
                }

                user.verifyEmailToken = token;

                user.save(function(err) {
                  done(err, token, user);
                });
              });
            },
            function(token, user, done) {
              var mailgun = require('mailgun-js')({apiKey: process.env.BK_EMAIL_API, domain: process.env.BK_EMAIL_URL});

              var subject = "Boost Kings - Verify your email address";

              var mailOptions = {
                to: user.email,
                from: `Boost Kings <${process.env.BK_EMAIL_ADDRESS}>`,
                subject: subject,
                replyTo: "boostkings@outlook.com",
                html: pug.renderFile("views/emails/template.pug", {
                  subject: subject,
                  cta: {
                    url: process.env.HOST + "/verify/" + token,
                    message: "Verify my email address",
                  },
                  paragraphs: [
                    "Hi there,",
                    "You are receiving this because you (or someone else) have requested to verify the email address for your account.",
                    "Please click on the following button to complete the signup process:",
                  ],
                })
              };

              mailgun.messages().send(mailOptions, function(err, body) {
                req.flash("info", "An email has been sent to " + user.email + " with further instructions.");
                done(err, "done");
              });
            },
          ],
          function(err) {
            if (err) return next(err);
            res.redirect("/verify");
          }
        );
      }
    });
  },

  function(req, res, next) {
    return res.redirect("/");
  }
);

module.exports = router;

/* global cordova, bluetoothSerial  */
// Ionic Starter App
// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.services' is found in services.js
// 'starter.controllers' is found in controllers.js
angular.module('talon', [
    'ionic',
    'ngCordova',
    'ngStorage',
    'talon.controllers',
    'talon.services',
    'talon.directives',
    'gettext'
])
    .run(function ($ionicPlatform, $rootScope) {
        $ionicPlatform.ready(function () {
            if (window.cordova && window.cordova.plugins.Keyboard) {
                cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
                cordova.plugins.Keyboard.disableScroll(true);
            }
            if (window.StatusBar) {
                StatusBar.styleLightContent();
            }

            if (!window.device) {
                window.device = {
                    model: 'Mock',
                    platform: 'Mock',
                    version: 'Mock',
                    uuid: 'Mock',
                };
            }
        });
    })

    .config(function ($httpProvider, $stateProvider, $urlRouterProvider) {
        $httpProvider.interceptors.push('adminAuthInterceptorService');
        $httpProvider.interceptors.push('multiTenantInterceptorService');

        // Ionic uses AngularUI Router which uses the concept of states
        // Learn more here: https://github.com/angular-ui/ui-router
        // Set up the various states which the app can be in.
        // Each state's controller can be found in controllers.js
        $stateProvider

            .state('login', {
                url: '/login',
                templateUrl: 'templates/login.html',
                controller: 'LoginCtrl'
            })
            .state('claim', {
                url: '/claim',
                cache: false,
                templateUrl: 'templates/claim.html',
                controller: 'ClaimCtrl'
            })
            .state('provision', {
                url: '/provision',
                cache: false,
                templateUrl: 'templates/provision.html',
                controller: 'ProvisionCtrl'
            })
            // setup an abstract state for the tabs directive
            .state('tab', {
                url: "/tab",
                abstract: true,
                templateUrl: "templates/tabs.html"
            })

            // Each tab has its own nav history stack:

            .state('tab.dash', {
                url: '/dash',
                cache: false,
                views: {
                    'tab-dash': {
                        templateUrl: 'templates/tab-dash.html',
                        controller: 'DashCtrl'
                    }
                }
            })


            .state('tab.account', {
                url: '/account',
                views: {
                    'tab-account': {
                        templateUrl: 'templates/tab-account.html',
                        controller: 'AccountCtrl'
                    }
                }
            });

        // if none of the above states are matched, use this as the fallback
        $urlRouterProvider.otherwise('/tab/dash');

    });

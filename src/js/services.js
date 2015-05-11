'use strict';
angular.module('talon.services', [
    'ngStorage'
])
    .constant('constants', {
        serviceBase: 'https://6daececf.ngrok.com/Talon/', //'https://talon.rescue.org/',
        deviceBase: 'http://10.10.10.254/data/UsbDisk1/Volume1/',
        deviceAuth: 'Basic YWRtaW46',
        clientId: 'TalonApp'
    })
    .factory('db',
    function () {
        var incomingDb = new PouchDB('talonIncomingDB', {adapter: 'websql'});
        var outgoingDb = new PouchDB('talonOutgoingDB', {adapter: 'websql'});
        incomingDb.info().then(console.dir.bind(console));
        outgoingDb.info().then(console.dir.bind(console));
        return {
            Incoming: incomingDb,
            Outgoing: outgoingDb
        };
    })
    .factory('multiTenantInterceptorService',
    function ($q, $injector, $location, $localStorage) {

        var multiTenantInterceptorServiceFactory = {};

        var _request = function (config) {

            config.headers = config.headers || {};

            var country = $localStorage.country;
            var organization = $localStorage.organization;
            if (country) {
                config.headers['X-Tenant-Country'] = country.Id;
            }
            if (organization) {
                config.headers['X-Tenant-Organization'] = organization.Id;
            }

            return config;
        }

        multiTenantInterceptorServiceFactory.request = _request;
        return multiTenantInterceptorServiceFactory;
    })
    .factory('adminAuthInterceptorService',
    function ($q, $injector, $location, $localStorage, $rootScope) {

        var authInterceptorServiceFactory = {};

        var _request = function (config) {
            var rootScope = $injector.get('$rootScope');
            if (!rootScope.isAdmin) {
                return config;
            }

            config.headers = config.headers || {};

            var authData = $localStorage.authorizationData;
            if (authData) {
                config.headers.Authorization = 'Bearer ' + authData.token;
            }

            return config;
        }

        var _responseError = function (rejection) {
            var rootScope = $injector.get('$rootScope');
            if (!rootScope.isAdmin) {
                return rejection;
            }

            if (rejection.status === 401) {
                var authService = $injector.get('authService');
                var authData = $localStorage.authorizationData;

                if (authData) {
                    if (authData.useRefreshTokens) {
                        $location.path('/refresh');
                        return $q.reject(rejection);
                    }
                }
                authService.logOut();

                $rootScope.$emit('app:signedOut');
            }
            return $q.reject(rejection);
        }

        authInterceptorServiceFactory.request = _request;
        authInterceptorServiceFactory.responseError = _responseError;

        return authInterceptorServiceFactory;
    })
    .factory('adminAuthService',
    function ($http, $q, constants, $localStorage, $rootScope) {

        var serviceBase = constants.serviceBase;
        var authServiceFactory = {};

        var _authentication = {
            isAuth: false,
            userName: "",
            useRefreshTokens: false
        };

        var _externalAuthData = {
            provider: "",
            userName: "",
            externalAccessToken: ""
        };

        var _saveRegistration = function (registration) {

            _logOut();

            return $http.post(serviceBase + 'api/account/register', registration).then(function (response) {
                return response;
            });

        };

        var _loadUserData = function () {
            var deferred = $q.defer();
            $http.get(constants.serviceBase + 'api/Account/Me')
                .then(function (response) {
                    $rootScope.currentUser = response.data;
                    $localStorage.currentUser = response.data;

                    $rootScope.organization = $rootScope.currentUser.Organization;
                    $localStorage.organization = $rootScope.currentUser.Organization;

                    var countries = $rootScope.currentUser.Countries.map(function (c) {
                        return c.Country;
                    });

                    if (!$localStorage.country) {
                        $localStorage.country = countries[0];
                    }

                    $rootScope.country = $localStorage.country;

                    if ($rootScope.currentUser.Countries.length > 1)
                        $rootScope.availableCountries = countries;
                    else
                        $rootScope.availableCountries = false;

                    deferred.resolve();
                })
                .catch(function () {
                    console.log(arguments);
                    deferred.reject(arguments);
                });

            return deferred.promise;
        };

        var _login = function (loginData) {

            var data = "grant_type=password&username=" + loginData.userName + "&password=" + loginData.password;

            if (loginData.useRefreshTokens) {
                data = data + "&client_id=" + constants.clientId;
            }

            $rootScope.isAdmin = true;

            var deferred = $q.defer();

            $http.post(serviceBase + 'token', data, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).success(function (response) {

                if (loginData.useRefreshTokens) {
                    $localStorage.authorizationData = {
                        qtoken: response.access_token,
                        userName: loginData.userName,
                        refreshToken: response.refresh_token,
                        useRefreshTokens: true,
                        isAdmin: true
                    };
                }
                else {
                    $localStorage.authorizationData = {
                        token: response.access_token,
                        userName: loginData.userName,
                        refreshToken: "",
                        useRefreshTokens: false,
                        isAdmin: true
                    };
                }
                _authentication.isAuth = true;
                _authentication.userName = loginData.userName;
                _authentication.useRefreshTokens = loginData.useRefreshTokens;

                deferred.resolve(response);

            }).error(function (err, status) {
                _logOut();
                deferred.reject(err);
            });

            return deferred.promise;

        };

        var _logOut = function () {
            delete $localStorage.authorizationData;

            $rootScope.isAdmin = true;

            _authentication.isAuth = false;
            _authentication.userName = "";
            _authentication.useRefreshTokens = false;

            return $http.post(serviceBase + 'api/Account/LogOut');
        };

        var _fillAuthData = function () {

            var authData = $localStorage.authorizationData;
            if (authData) {
                _authentication.isAuth = true;
                _authentication.userName = authData.userName;
                _authentication.useRefreshTokens = authData.useRefreshTokens;
            }

        };

        var _refreshToken = function () {
            var deferred = $q.defer();

            var authData = $localStorage.authorizationData;

            if (authData) {

                if (authData.useRefreshTokens) {

                    var data = "grant_type=refresh_token&refresh_token=" + authData.refreshToken + "&client_id=" + constants.clientId;

                    delete $localStorage.authorizationData;

                    $http.post(serviceBase + 'token', data, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).success(function (response) {

                        $localStorage.authorizationData = {
                            token: response.access_token,
                            userName: response.userName,
                            refreshToken: response.refresh_token,
                            useRefreshTokens: true
                        };

                        deferred.resolve(response);

                    }).error(function (err, status) {
                        _logOut();
                        deferred.reject(err);
                    });
                }
            }

            return deferred.promise;
        };

        var _obtainAccessToken = function (externalData) {

            var deferred = $q.defer();

            $http.get(serviceBase + 'api/account/ObtainLocalAccessToken', { params: { provider: externalData.provider, externalAccessToken: externalData.externalAccessToken } }).success(function (response) {
                $localStorage.authorizationData = {
                    token: response.access_token,
                    userName: response.userName,
                    refreshToken: "",
                    useRefreshTokens: false
                }

                _authentication.isAuth = true;
                _authentication.userName = response.userName;
                _authentication.useRefreshTokens = false;

                deferred.resolve(response);

            }).error(function (err, status) {
                _logOut();
                deferred.reject(err);
            });

            return deferred.promise;

        };

        var _registerExternal = function (registerExternalData) {

            var deferred = $q.defer();

            $http.post(serviceBase + 'api/account/registerexternal', registerExternalData).success(function (response) {
                $localStorage.authorizationData = {
                    token: response.access_token,
                    userName: response.userName,
                    refreshToken: "",
                    useRefreshTokens: false
                };

                _authentication.isAuth = true;
                _authentication.userName = response.userName;
                _authentication.useRefreshTokens = false;

                deferred.resolve(response);

            }).error(function (err, status) {
                _logOut();
                deferred.reject(err);
            });

            return deferred.promise;

        };

        authServiceFactory.saveRegistration = _saveRegistration;
        authServiceFactory.login = _login;
        authServiceFactory.logOut = _logOut;
        authServiceFactory.fillAuthData = _fillAuthData;
        authServiceFactory.authentication = _authentication;
        authServiceFactory.refreshToken = _refreshToken;

        authServiceFactory.obtainAccessToken = _obtainAccessToken;
        authServiceFactory.externalAuthData = _externalAuthData;
        authServiceFactory.registerExternal = _registerExternal;
        authServiceFactory.loadUserData = _loadUserData;


        return authServiceFactory;
    })
    .factory('vendorAuthService',
    function ($http, $q, constants, $cordovaDevice, $localStorage, $rootScope) {
        var vendorAuthServiceFactory = {
            login: function (userName, password) {
                var payload = {
                    UserName: userName,
                    Password: password,
                    Device: $cordovaDevice.getDevice()
                }
                var deferred = $q.defer();

                $http.post(constants.serviceBase + 'api/App/VendorProfile/Login', payload)
                    .then(function (response) {
                        if (response.status == 200) {
                            $localStorage.authorizationData = {
                                userName: payload.UserName,
                                token: response.data.token,
                                uuid: payload.Device.UUID
                            };

                            deferred.resolve($localStorage.authorizationData);
                        } else {
                            deferred.reject(response.data);
                        }
                    })
                    .catch(function (err, status) {
                        deferred.reject(err);
                    })

                return deferred.promise;
            }
        };

        return vendorAuthServiceFactory;
    })
    .factory('DashboardService',
    function (constants, $http, $localStorage, $q, $rootScope, db) {
        var loadPouch = function (data, deferred) {
            var promises = data.map(function (v) {
                v._id = v.RecordKey;
                return db.Incoming.putIfNotExists(v);
            });

            $q.when(promises)
                .then(function () {
                    deferred.resolve.apply(deferred, arguments);
                })
                .catch(function () {
                    deferred.resolve.apply(deferred, arguments);
                });
        };
        return {
            syncFromDevice: function () {
                var deferred = $q.defer();
                var store = cordova.file.dataDirectory;
                var manifestFile = store + 'OpenTransactions.json';
                var uri = encodeURI(constants.deviceBase + "OpenTransactions.json");
                var fileTransfer = new FileTransfer();

                fileTransfer.download(uri,
                    manifestFile,
                    function () {
                        window.resolveLocalFileSystemURL(manifestFile,
                            function (entry) {
                                entry.file(function (file) {
                                    var reader = new FileReader();
                                    reader.onloadend = function (evt) {
                                        $rootScope.$apply(function () {
                                            var openTransactions = JSON.parse(evt.target.result);

                                            loadPouch(openTransactions, deferred);
                                        });
                                    };
                                    reader.readAsText(file);
                                }, function () {
                                    deferred.reject.apply(deferred, arguments);
                                })
                            }
                        );
                    },
                    function (err) {
                        deferred.reject.apply(deferred, arguments);
                    },
                    false,
                    { headers: { "Authorization": constants.deviceAuth } }
                );

                return deferred.promise;
            },
            syncFromServer: function () {
                var deferred = $q.defer();
                $http.get(constants.serviceBase + 'api/App/OTA/DownloadOpenTransactions')
                    .then(function (res) {
                        loadPouch(res.data, deferred);
                    })
                    .catch(function () {
                        deferred.reject.apply(deferred, arguments);
                    });

                return deferred.promise;
            },
            getLastSent: function () {
                return $q.when(db.Incoming.query({
                    map: function (doc) {
                        if (doc.Date)
                            emit(doc._id, moment(doc.Date).unix());
                    },
                    reduce: '_stats' }, { reduce: true })
                    .then(function (result) {
                        console.log('Result', result, result.rows[0].value.max, moment.unix(result.rows[0].value.max));
                        if (result.rows.length) {
                            return {
                                LatestVoucher: moment.unix(result.rows[0].value.max)
                            };
                        } else {
                            return {};
                        }
                    }));
            }
        };
    })
    .factory('VoucherService',
    function (constants, $http, $localStorage, $q, $rootScope, db) {
        var getKey = function (voucher, id) {
            var pad = "00000000";
            var paddedId = forge.util.encodeUtf8(pad.substring(0, pad.length - id.length) + id);
            var md = forge.md.md5.create();
            md.update(forge.util.encodeUtf8(paddedId + ':' + voucher))
            var digest = md.digest()
            var key = forge.util.encode64(digest.data)

            return key;
        };
        return {
            listInformation: function (codes, id) {
                return $q.all(codes.map(function (c) {
                    var key = getKey(c, id);
                    var deferred = $q.defer();
                    db.Incoming
                        .get(key)
                        .then(function (d) {
                            deferred.resolve(doc);
                        })
                        .catch(function (d) {
                            deferred.resolve(null);
                        });
                    return deferred.promise;
                }))
            }
        };
    })
    .factory('BeneficiaryService',
    function (constants, $http, $localStorage, $q, $rootScope, db) {
        return {
            loadBeneficiary: function (nationalId) {
                var deferred = $q.defer();

                $http.get(constants.serviceBase + 'api/App/Administration/LoadBeneficiary?nationalId=' + nationalId)
                    .success(function (data) {
                        deferred.resolve(data);
                    })
                    .error(function (err) {
                        deferred.reject(err);
                    })
                return deferred.promise;
            },
            loadVouchers: function (nationalId) {
                var deferred = $q.defer();

                $http.get(constants.serviceBase + 'api/App/Administration/LoadVouchers?nationalId=' + nationalId)
                    .success(function (data) {
                        deferred.resolve(data);
                    })
                    .error(function (err) {
                        deferred.reject(err);
                    })
                return deferred.promise;
            }
        };
    })


;

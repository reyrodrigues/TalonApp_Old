angular.module('talon.services', [
  'ngStorage',
  'breeze.angular'
])
.constant('constants', {
    serviceBase: 'http://6daececf.ngrok.com/Talon/', //'https://talon.rescue.org/',
    clientId: 'ngAuthApp'
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
.factory('authInterceptorService',
function ($q, $injector,$location, $localStorage, $rootScope) {

    var authInterceptorServiceFactory = {};

    var _request = function (config) {

        config.headers = config.headers || {};

        var authData = $localStorage.authorizationData;
        if (authData) {
            config.headers.Authorization = 'Bearer ' + authData.token;
        }

        return config;
    }

    var _responseError = function (rejection) {
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
.factory('authService',
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

      var deferred = $q.defer();

      $http.post(serviceBase + 'token', data, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).success(function (response) {

          if (loginData.useRefreshTokens) {
              $localStorage.authorizationData = {
                  qtoken: response.access_token,
                  userName: loginData.userName,
                  refreshToken: response.refresh_token,
                  useRefreshTokens: true
              };
          }
          else {
              $localStorage.authorizationData = {
                  token: response.access_token,
                  userName:
                  loginData.userName,
                  refreshToken: "",
                  useRefreshTokens: false
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
                      refreshToken:
                      response.refresh_token,
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
.factory('backendService',
function (breeze, constants, $localStorage) {
    var serviceBase = constants.serviceBase;
    // define the Breeze `DataService` for this app
    var dataService = new breeze.DataService({
        serviceName: serviceBase + 'Breeze/EVM',
        hasServerMetadata: false  // don't ask the server for metadata
    });

    // create the metadataStore
    var metadataStore = new breeze.MetadataStore({
    });

    // initialize it from the application's metadata variable
    if(window.MainMetadata)
        metadataStore.importMetadata(window.MainMetadata);

    metadataStore.setProperties({
        serializerFn: function (dataProperty, value) {
            if (dataProperty.dataType.name == "DateTime" && /Date$/.test(dataProperty.name)) {
                return moment.tz(moment(value).format("YYYY-MM-DD"), 'utc').toDate();
            } else if (dataProperty.dataType.name == 'DateTime') {
                return moment(value).tz('utc').toDate();
            }
            if (dataProperty.name == 'CountryId') {
                // Globaly setting Country based on users local storage
                return $localStorage.country.Id;
            }
            if (dataProperty.name == 'OrganizationId') {
                // Globaly setting Organization based on users local storage
                return $localStorage.organization.Id;
            }

            return value;
        }
    });

    var Beneficiary = function () {
        this.Name = "";
    };

    // register your custom constructor
    metadataStore.registerEntityTypeCtor("Beneficiary", Beneficiary);

    // create a new EntityManager that uses this metadataStore
    var entityManager = new breeze.EntityManager({
        dataService: dataService,
        metadataStore: metadataStore
    });

    var queryOptions = entityManager.queryOptions.using({
        fetchStrategy: breeze.FetchStrategy.FromServer
    });
    entityManager.setProperties({ queryOptions: queryOptions });
    entityManager.saveOptions = new breeze.SaveOptions({ allowConcurrentSaves: true });

    return entityManager;
})
.factory('DashboardService',
function(constants, $http, $localStorage) {
  return {
    restore: function() {
      var dates = ($localStorage.Vouchers||[]).map(function(v) { return v.Date; });
      console.log(dates);
      dates = dates.sort();
      dates = dates.reverse();
      console.log(dates);

      var beginPeriod = '';
      if(dates.length > 0)
        beginPeriod = dates[0];

      var endPeriod = moment().toJSON();
      var url = constants.serviceBase + 'api/App/OTARestore?begin=' + beginPeriod + '&end=' + endPeriod;

      return $http.get(url).then(function(response) {
        $localStorage.BeginPeriod = endPeriod;

        return response;
      });
    },
    remove: function(chat) {
      chats.splice(chats.indexOf(chat), 1);
    },
    get: function(chatId) {
      for (var i = 0; i < chats.length; i++) {
        if (chats[i].id === parseInt(chatId)) {
          return chats[i];
        }
      }
      return null;
    }
  };
});

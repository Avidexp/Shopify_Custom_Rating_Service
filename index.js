/*

Author:     Dylan Jackson
Email:      dj0759@gmail.com

*/

const dotenv = require('dotenv').config()
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = ['read_products',  'write_shipping'];
const forwardingAddress = "http://c371ddd5.ngrok.io"; // Outbound URL for shopify integration
app.get('/', (req, res) => {
  res.send('GlobalTranz Custom Shopify Integration');
});

app.listen(3000, () => {
  console.log('App listening for connections on port 3000!');
});


/* 
The install route expects a shop URL parameter, 
which it uses to redirect the merchant to the Shopify app authorization prompt 
where they can choose to accept or reject the installation request.
*/

app.get('/shopify', (req, res) => {
    console.log("Hit shop/shopify URL ")
    const shop = req.query.shop;
    if (shop) {
      const state = nonce();
      const redirectUri = forwardingAddress + '/shopify/callback';
      console.log("Redirect URL = " + redirectUri);
      const installUrl = 'https://' + shop +
        '/admin/oauth/authorize?client_id=' + apiKey +
        '&scope=' + scopes +
        '&state=' + state +
        '&redirect_uri=' + redirectUri;
  
      res.cookie('state', state);
      res.redirect(installUrl);
    } else {
      return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
    }
  });

  app.get('/shopify/callback', (req, res) => {
      console.log("Hit callback URL");
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;
  
    if (state !== stateCookie) {
      return res.status(403).send('Request origin cannot be verified');
    }
  
    if (shop && hmac && code) {
      // DONE: Validate request is from Shopify
      const map = Object.assign({}, req.query);
      delete map['signature'];
      delete map['hmac'];
      const message = querystring.stringify(map);
      const providedHmac = Buffer.from(hmac, 'utf-8');
      const generatedHash = Buffer.from(
        crypto
          .createHmac('sha256', apiSecret)
          .update(message)
          .digest('hex'),
          'utf-8'
        );
      let hashEquals = false;
  
      try {
        hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
      } catch (e) {
        hashEquals = false;
      };
  
      if (!hashEquals) {
        return res.status(400).send('HMAC validation failed');
      }
  
      // DONE: Exchange temporary code for a permanent access token
      const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
      const accessTokenPayload = {
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      };
      /*
      curl -X POST -d @carrier_service.json
      -H"Accept:application/json" 
      -H"Content-Type:application/json" 
      -H"X-Shopify-Access-Token:72027b81b0ba7ae478c95e624849e13d"

      https://globaltranz.myshopify.com/admin/carrier_services.json
      */
      request.post(accessTokenRequestUrl, { json: accessTokenPayload })
      .then((accessTokenResponse) => {
        const accessToken = accessTokenResponse.access_token;
        const uri = 'https://' + shop + '/admin/carrier_services.json';
        console.log("URI: " + uri);
        console.log("AccessToken : " + accessToken);

        // Create single carrier to gather rates
        var options1 = {
          method:'POST',
          uri: uri,
          body:{
            "carrier_service": {
            "name": "Test4",
            "callback_url": "http://c371ddd5.ngrok.io/shopify/getRate",
            "service_discovery": true,
            "format":"json"
        }},
          headers:{
            'Content-Type':'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          json: true
        };
        request(options1)
          .then(function(response){
            console.log(response);
          }).catch(function(err){
            console.log("ERROR FOUND: ");
            console.log(err);
          });

          console.log("--------------- GET Current Carrier Services ------------------");
          // ================================================
          var options2 = {
            method:'GET',
            uri: `https://${shop}/admin/carrier_services.json`,
            headers:{
              'Content-Type':'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            json: true
          };
          request(options2)
            .then(function(response){
              console.log(response.body);

            }).catch(function(err){
              console.log(err);
            })
            console.log("---------------------------------");
          //=================================================
          console.log("Successfully installed Shopify Integration");
          res.redirect('/');
        //res.status(200).send("Got an access token, let's do something with it");
        // TODO
        // Use access token to make API call to 'shop' endpoint
      })
      .catch((error) => {
        res.status(error.statusCode).send(error.error.error_description);
      });
  
    } else {
      res.status(400).send('Required parameters missing');
    }
  });


  app.post('/shopify/getRate', (req, res) => {

    // API call to get rates (Can have different API's for different carriers)
  console.log("Started getRate Query: ")
  console.log(req.body);

    var response =  {
    "rates":[{
    'service_name':'Carrier_Name',
    'service_code': 'DIL',
    'total_price': '100000.80',
    'currency': 'USD',
    'min_delivery_date' : '2018-07-28 14:48:45 -0400',
    'max_delivery_date' : '2018-07-30 14:48:45 -0400'
    }]};

  console.log(response);
  res.send(response);
  });

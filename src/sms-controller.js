/* Module Imports */
const uberController = require('./uber-controller');
const store = require('./store');
const models = require('./models');

const loginHandler = async (sessionKey, redis) => {
  await store.set_session_status(sessionKey, models.statusCodes.totp, redis);
  return ["Enter TOTP for auth:"];
}

const totpHandler = async (input, sessionKey, redis) => {
  const cookies = await uberController.login_with_totp(input);
  
  if (cookies) {
    await store.set_session_cookies(sessionKey, cookies, redis);
    await store.set_session_status(sessionKey, models.statusCodes.mainMenu, redis);
  }
  
  return ["Logged in: " + (cookies != null) + (cookies != null ? "\nMain menu:\nride/r\nsettings/s" : "Try entering TOTP again.")];
}

const newRideHandler = async (sessionKey, redis) => {
  await store.set_session_status(sessionKey, models.statusCodes.inputSource, redis);
  return ["Where from?"];
}

const inputSourceHandler = async (input, sessionKey, redis, cookies) => {
  const resolvedAddress = await store.resolve_address(sessionKey, input, redis);
  if (resolvedAddress) {
    await store.set_session_status(sessionKey, models.statusCodes.inputDest, redis);
    await store.set_session_source_address(sessionKey, resolvedAddress[0], redis);
    await store.set_session_source_option(sessionKey, resolvedAddress[1], redis);
    return ["Where to?"];
  }
  const addresses = await uberController.lookup_address(input, cookies);
  response = ["0. Reenter address."].concat(addresses).concat(["Which option?"]).join('\n\n');
  await store.set_session_status(sessionKey, models.statusCodes.chooseSource, redis);
  await store.set_session_source_address(sessionKey, input, redis);
  return [response];
}

const chooseSourceHandler = async (input, sessionKey, redis) => {
  const choice = Number(input);
  
  if (choice === 0) {
    await store.set_session_status(sessionKey, models.statusCodes.inputSource, redis);
    return ["Where from?"];
  }

  await store.set_session_source_option(sessionKey, choice, redis);
  await store.set_session_status(sessionKey, models.statusCodes.inputDest, redis);

  return ["Where to?"];
}

const inputDestHandler = async (input, sessionKey, redis, cookies) => {
  const resolvedAddress = await store.resolve_address(sessionKey, input, redis);
  if (resolvedAddress) {
    await store.set_session_status(sessionKey, models.statusCodes.chooseTravelOption, redis);
    await store.set_session_dest_address(sessionKey, resolvedAddress[0], redis);
    await store.set_session_dest_option(sessionKey, resolvedAddress[1], redis);
  
    const srcAddress = await store.get_session_source_address(sessionKey, redis);
    const srcOption = await store.get_session_source_option(sessionKey, redis);
    const src = {
      address: srcAddress,
      option: srcOption
    }
    const dst = {
      address: resolvedAddress[0],
      option: resolvedAddress[1]
    }
    const rates = await uberController.lookup_rates(src, dst, cookies);
    return [rates.concat(["Which option?"]).join('\n\n')];
  }
  const addresses = await uberController.lookup_address(input, cookies);
  response = ["0. Reenter address."].concat(addresses).concat(["Which option?"]).join('\n\n');
  await store.set_session_status(sessionKey, models.statusCodes.chooseDest, redis);
  await store.set_session_dest_address(sessionKey, input, redis);
  return [response];
}

const chooseDestHandler = async (input, sessionKey, redis, cookies) => {
  const choice = Number(input);
  
  if (choice === 0) {
    await store.set_session_status(sessionKey, models.statusCodes.inputDest, redis);
    return ["Where to?"];
  }

  await store.set_session_dest_option(sessionKey, choice, redis);
  await store.set_session_status(sessionKey, models.statusCodes.chooseTravelOption, redis);

  const srcAddress = await store.get_session_source_address(sessionKey, redis);
  const srcOption = await store.get_session_source_option(sessionKey, redis);
  const destAddress = await store.get_session_dest_address(sessionKey, redis);
  const destOption = await store.get_session_dest_option(sessionKey, redis);
  const src = {
    address: srcAddress,
    option: srcOption
  }
  const dst = {
    address: destAddress,
    option: destOption
  }
  const rates = await uberController.lookup_rates(src, dst, cookies);
  return [rates.concat(["Which option?"]).join('\n\n')];
}

const chooseTravelOptionHandler = async (input, sessionKey, redis, cookies) => {
  const choice = Number(input);
  
  const srcAddress = await store.get_session_source_address(sessionKey, redis);
  const srcOption = await store.get_session_source_option(sessionKey, redis);
  const destAddress = await store.get_session_dest_address(sessionKey, redis);
  const destOption = await store.get_session_dest_option(sessionKey, redis);
  const src = {
    address: srcAddress,
    option: srcOption
  }
  const dst = {
    address: destAddress,
    option: destOption
  }  
  const tripDetails = await uberController.book_trip(src, dst, choice, cookies);

  await store.set_session_status(sessionKey, models.statusCodes.rideInProgress, redis);

  return tripDetails;
}

const logoutHandler = async (sessionKey, redis) => {
  await store.logout_session(sessionKey, redis);
  return ["Logged out."];
}

const nukeHandler = async (sessionKey, redis) => {
  await store.nuke_session(sessionKey, redis);
  return ["Nuked session! Booom shakalaka"];
}

const mainMenuSpecialCommandHandler = async (sessionKey, redis) => {
  await store.set_session_status(sessionKey, models.statusCodes.mainMenu, redis);
  return ["Main menu:\nride/r\nsettings/s"];
}

const mainMenuHandler = async (input, sessionKey, redis) => {
  if (input === "r" || input === "ride") {
    return await newRideHandler(sessionKey, redis);
  } 
  if (input === "s" || input === "settings") {
    await store.set_session_status(sessionKey, models.statusCodes.settings, redis);
    return ["Settings menu: \nsave address/s\nshow address book/a"];
  }
  return ["unrecognized menu command. try ride/r or settings/s"];
}

const settingsHandler = async (input, sessionKey, redis) => {
  if (input === "s" || input === "save address") {
    await store.set_session_status(sessionKey, models.statusCodes.saveName, redis);
    return ["enter name to save address by: "];
  }
  if (input === "a" || input === "show address book") {
    const addressBook = await store.get_address_book(sessionKey, redis);
    let strAddresssBook = "";
    for (var key in addressBook) {
      if (addressBook.hasOwnProperty(key)) {
        strAddresssBook+= key + " -> " + addressBook[key] +"\n";
      }
    }
    return [strAddresssBook];
  }
  return ["unrecognized menu command.\ntry:\nsave address/s\nshow address book/a"];
}

const saveNameHandler = async (input, sessionKey, redis) => {
  await store.save_temp_address_name(input, sessionKey, redis);
  await store.set_session_status(sessionKey, models.statusCodes.saveAddress, redis);
  return ["enter address: "];
}

const saveAddressHandler = async (input, sessionKey, redis, cookies) => {
  const addresses = await uberController.lookup_address(input, cookies);
  response = ["0. Reenter address."].concat(addresses).concat(["Which option?"]).join('\n\n');
  await store.save_temp_address_address(input, sessionKey, redis);
  await store.set_session_status(sessionKey, models.statusCodes.saveAddressOption, redis);
  return [response];
}

const rideInProgressOptionHandler = async (input, sessionKey, redis, cookies) => {
  switch (input) {
    case "cancel":
      const success = await uberController.cancel_trip(cookies);
      if (success) {
        await store.set_session_status(sessionKey, models.statusCodes.mainMenu, redis);
        return ["trip cancelled!"]; 
      } else {
        return ["error cancelling trip"]; 
      }
    default:
      return ["command not recognized. try again...\ncancel"];
  }
}

const saveAddressOptionHandler = async (input, sessionKey, redis) => {
  const choice = Number(input);
  
  if (choice === 0) {
    await store.set_session_status(sessionKey, models.statusCodes.saveAddress, redis);
    return ["enter address: "];
  }

  const name = await store.get_temp_address_name(sessionKey, redis);
  const address = await store.get_temp_address_address(sessionKey, redis);
  
  await store.save_address(sessionKey, name, address, choice, redis);
  await store.set_session_status(sessionKey, models.statusCodes.mainMenu, redis);

  return ["address saved! back to main menu"];
}

const inputRouter = async (input, sessionKey, redis) => {
  /* Handle logged out special commands first */
  if (input === "radio-check") {
    return ["Radio check! One two. Check check. One two. Check!"];
  }

  // TODO: check session cookies instead
  const sessionStatus = await store.get_session_status(sessionKey, redis);
  if (sessionStatus === models.statusCodes.loggedOut) {
    return await loginHandler(sessionKey, redis);
  }

  /* Handle logged in special commands first */
  if (input === "menu") {
    return await mainMenuSpecialCommandHandler(sessionKey, redis);
  }
  /* Handle special commands first */
  if (input === "u") {
    return await newRideHandler(sessionKey, redis);
  } 
  if (input === "logout") {
    return await logoutHandler(sessionKey, redis);
  }
  if (input === "nuke") {
    return await nukeHandler(sessionKey, redis);
  }

  const sessionCookies = await store.get_session_cookies(sessionKey, redis);

  switch(sessionStatus) {
    case models.statusCodes.totp: 
      return await totpHandler(input, sessionKey, redis);
    case models.statusCodes.mainMenu:
      return await mainMenuHandler(input, sessionKey, redis);
    case models.statusCodes.settings:
      return await settingsHandler(input, sessionKey, redis);
    case models.statusCodes.saveName:
      return await saveNameHandler(input, sessionKey, redis);
    case models.statusCodes.saveAddress:
      return await saveAddressHandler(input, sessionKey, redis, sessionCookies);
    case models.statusCodes.saveAddressOption:
      return await saveAddressOptionHandler(input, sessionKey, redis);
    case models.statusCodes.inputSource:
      return await inputSourceHandler(input, sessionKey, redis, sessionCookies);
    case models.statusCodes.chooseSource:
      return await chooseSourceHandler(input, sessionKey, redis);
    case models.statusCodes.inputDest:
      return await inputDestHandler(input, sessionKey, redis, sessionCookies);
    case models.statusCodes.chooseDest:
      return await chooseDestHandler(input, sessionKey, redis, sessionCookies);
    case models.statusCodes.chooseTravelOption:
      return await chooseTravelOptionHandler(input, sessionKey, redis, sessionCookies);
    case models.statusCodes.rideInProgress:
      return await rideInProgressOptionHandler(input, sessionKey, redis, sessionCookies);
    default:
      return ""; // TODO
  }
}

const smsHandler = async (request, redis, twilio) => {
  const input = request.Body.toLowerCase();
  const from = request.From.toLowerCase();
  const to = request.To.toLowerCase();

  console.log("\n\n[SMS Handler] NEW SMS");
  console.log("[SMS Handler] From: \n" + from);
  console.log("[SMS Handler] Input: \n" + input);

  inputRouter(input, from, redis).then((messages) => {
    console.log("Async handler finished. Sending: " + messages.join("\n"));
    console.log("From: " + from);
    console.log("To: " + to);
    messages.forEach((message) => {
      twilio.client.messages
      .create({
         body: message,
         from: to,
         to: from
       })
      .then(message => console.log(message.sid));
    });
  }); 

  return new twilio.messagingResponse().toString();
}

/* External API */
exports.smsHandler = smsHandler;

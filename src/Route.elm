module Route exposing
    ( Route(..)
    , billIdsToUrl
    , billToUrl
    , fromUrl
    , route
    , toRoute
    , toUrlString
    )

import Bill
import Url exposing (Url)
import Url.Builder exposing (absolute)
import Url.Parser exposing ((</>), Parser, map, oneOf, parse, s, string, top)


type Route
    = Home
    | Bill String String
    | Member String
    | NotFound


route : Parser (Route -> a) a
route =
    oneOf
        [ map Home top

        -- /bill/<type>/<number>
        , map Bill (s "bill" </> s "118" </> string </> string)
        , map Member (s "member" </> string)
        ]


fromUrl : Url.Url -> Route
fromUrl url =
    Maybe.withDefault NotFound (parse route url)


toUrlString : Route -> String
toUrlString r =
    case r of
        Bill type_ number ->
            Bill.blank type_ number |> billToUrl

        _ ->
            "/"


toRoute : String -> Route
toRoute string =
    case Url.fromString string of
        Nothing ->
            NotFound

        Just url ->
            Maybe.withDefault NotFound (parse route url)


billToUrl : Bill.Model -> String
billToUrl bill =
    absolute [ "bill", "118", bill.type_, bill.number ] []


bioguideIdToUrl : String -> String
bioguideIdToUrl bioguideId =
    absolute [ "member", bioguideId ] []


billIdsToUrl : String -> String -> String
billIdsToUrl type_ number =
    absolute [ "bill", "118", type_, number ] []

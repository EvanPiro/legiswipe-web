module Route exposing (Route(..), billToUrl, fromUrl, route, toRoute, toUrlString)

import Bill
import Url exposing (Url)
import Url.Builder exposing (absolute)
import Url.Parser exposing ((</>), Parser, map, oneOf, parse, s, string, top)


type Route
    = Home
    | Bill String String
    | NotFound


route : Parser (Route -> a) a
route =
    oneOf
        [ map Home top
        , map Bill (s "bill" </> string </> string)
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
    absolute [ "bill", bill.type_, bill.number ] []
